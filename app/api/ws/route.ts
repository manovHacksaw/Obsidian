import { NextRequest } from "next/server";
import * as net    from "net";
import * as tls    from "tls";
import * as dns    from "dns/promises";
import * as crypto from "crypto";
import { isBlockedIp }                                    from "@/lib/ip-guard";
import { createWsSession, attachEchoHandler, injectData } from "@/lib/ws-sessions";

export const runtime = "nodejs";

// RFC 6455 §1.3 — fixed magic GUID concatenated with the client's key
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function generateKey(): string {
  return crypto.randomBytes(16).toString("base64");
}

function computeAccept(key: string): { sha1Hex: string; accept: string } {
  const input   = key + WS_GUID;
  const sha1    = crypto.createHash("sha1").update(input);
  const sha1Hex = sha1.copy().digest("hex");
  const accept  = sha1.digest("base64");
  return { sha1Hex, accept };
}

function buildUpgradeRequest(host: string, path: string, key: string): string {
  return [
    `GET ${path || "/"} HTTP/1.1`,
    `Host: ${host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "User-Agent: ObsidianSim/1.0",
    "",
    "",
  ].join("\r\n");
}

// Read from socket until the HTTP header block ends (\r\n\r\n).
// Returns the header string AND any bytes that arrived in the same TCP chunk
// after the boundary (WebSocket frames that the server sent immediately).
function readHeaders(
  socket: net.Socket | tls.TLSSocket,
  timeoutMs = 10_000,
): Promise<{ raw: string; leftover: Buffer }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const tid = setTimeout(() => {
      socket.off("data", onData);
      resolve({ raw: Buffer.concat(chunks).toString("latin1"), leftover: Buffer.alloc(0) });
    }, timeoutMs);

    function onData(chunk: Buffer) {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const str = buf.toString("latin1");
      const idx = str.indexOf("\r\n\r\n");
      if (idx !== -1) {
        clearTimeout(tid);
        socket.off("data", onData);
        const headerEnd = idx + 4;
        resolve({
          raw:      str.slice(0, headerEnd),
          leftover: buf.subarray(headerEnd),
        });
      }
    }
    socket.on("data", onData);
    socket.once("error", () => { clearTimeout(tid); resolve({ raw: "", leftover: Buffer.alloc(0) }); });
  });
}

interface WSConnectBody {
  mode: "virtual" | "real";
  url?: string;
}

export async function POST(req: NextRequest) {
  let body: WSConnectBody;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { mode, url } = body;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* ignore — client may have disconnected */ }
      }

      const sessionStart = Date.now();

      // ── Virtual mode ───────────────────────────────────────────────
      if (mode === "virtual") {
        // Spin up a real loopback TCP server. After the HTTP upgrade it stays alive
        // and echoes WebSocket frames back to the client — making it a real echo server.

        let capturedSs: net.Socket | null = null;

        const server = net.createServer((ss) => {
          capturedSs = ss;
          let buf = "";

          function onHandshakeData(chunk: Buffer) {
            buf += chunk.toString("latin1");
            if (!buf.includes("\r\n\r\n")) return;

            // Remove this handler — WebSocket frame data must not feed into it
            ss.off("data", onHandshakeData);

            const keyMatch = buf.match(/Sec-WebSocket-Key:\s*(.+)\r\n/i);
            const key      = keyMatch?.[1]?.trim() ?? "";
            const { accept } = computeAccept(key);

            const response = [
              "HTTP/1.1 101 Switching Protocols",
              "Upgrade: websocket",
              "Connection: Upgrade",
              `Sec-WebSocket-Accept: ${accept}`,
              "",
              "",
            ].join("\r\n");

            ss.write(response, "latin1");

            // Attach WebSocket echo handler to the server socket.
            // The session's frame parser handles the client socket (sock) separately.
            attachEchoHandler(ss);
          }

          ss.on("data", onHandshakeData);
          ss.on("error", () => {});
        });

        await new Promise<void>((res, rej) => {
          server.listen(0, "127.0.0.1", res);
          server.once("error", rej);
        });

        const { port } = server.address() as net.AddressInfo;

        // ── Phase 1: simulated connect steps ──
        emit({ type: "phase", phase: "connect", status: "active" });

        const rand = (n: number) => Math.floor(Math.random() * n);

        emit({ type: "lifecycle", step: "dns", status: "active" });
        await new Promise<void>((r) => setTimeout(r, 10 + rand(10)));
        emit({ type: "lifecycle", step: "dns", status: "done", durationMs: 10 + rand(8), resolvedIp: "127.0.0.1" });

        emit({ type: "lifecycle", step: "tcp", status: "active" });
        const tcpStart = Date.now();
        const sock = new net.Socket();
        await new Promise<void>((res, rej) => {
          sock.connect(port, "127.0.0.1", res);
          sock.once("error", rej);
        });
        emit({ type: "lifecycle", step: "tcp", status: "done", durationMs: Date.now() - tcpStart });
        emit({ type: "phase", phase: "connect", status: "done", durationMs: Date.now() - sessionStart });

        // ── Phase 2: upgrade handshake ──
        const key            = generateKey();
        const upgradeRequest = buildUpgradeRequest("localhost", "/", key);
        const { sha1Hex, accept } = computeAccept(key);

        emit({ type: "phase", phase: "handshake", status: "active" });
        emit({
          type:    "handshake_request",
          raw:     upgradeRequest,
          key,
          headers: {
            "Upgrade":               "websocket",
            "Connection":            "Upgrade",
            "Sec-WebSocket-Key":     key,
            "Sec-WebSocket-Version": "13",
          },
        });

        sock.write(upgradeRequest, "latin1");
        const { raw: responseRaw, leftover } = await readHeaders(sock);

        emit({
          type:       "handshake_response",
          raw:        responseRaw,
          statusCode: 101,
          accept,
          derivation: { key, guid: WS_GUID, input: key + WS_GUID, sha1Hex, accept },
          elapsedMs:  Date.now() - sessionStart,
        });

        emit({ type: "phase", phase: "handshake", status: "done" });

        // ── Keep socket alive: create session ──
        const sessionId = crypto.randomUUID();
        const session = createWsSession(sessionId, sock, server);
        if (leftover.length > 0) injectData(session, leftover);

        // Virtual server sends a greeting right away so the server → client
        // direction is visible without needing to send something first.
        // setImmediate defers one tick so createWsSession's data handler
        // is guaranteed to be attached to sock before the frame arrives.
        setImmediate(() => {
          if (capturedSs && !capturedSs.destroyed) {
            const text = "Virtual echo server connected — I will echo everything you send.";
            const payload = Buffer.from(text, "utf8");
            // Unmasked text frame: FIN=1, opcode=0x01, MASK=0, len ≤ 125
            capturedSs.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
          }
        });

        // After 5s, send a ping so learners can see the ping/pong keepalive exchange.
        // Unmasked ping frame: FIN=1, opcode=0x09, MASK=0
        setTimeout(() => {
          if (capturedSs && !capturedSs.destroyed) {
            const pingPayload = Buffer.from("keepalive");
            capturedSs.write(Buffer.concat([Buffer.from([0x89, pingPayload.length]), pingPayload]));
          }
        }, 5000);

        emit({ type: "connected", sessionId, elapsedMs: Date.now() - sessionStart });
        emit({ type: "done" });
        controller.close();
        return;
      }

      // ── Real mode ──────────────────────────────────────────────────
      if (!url) {
        emit({ type: "error", message: "URL required for real mode" });
        emit({ type: "done" });
        controller.close();
        return;
      }

      let parsed: URL;
      try { parsed = new URL(url); }
      catch {
        emit({ type: "error", message: `Invalid URL: ${url}` });
        emit({ type: "done" });
        controller.close();
        return;
      }

      const isWss    = parsed.protocol === "wss:";
      const hostname = parsed.hostname;
      const port     = parseInt(parsed.port) || (isWss ? 443 : 80);
      const path     = (parsed.pathname || "/") + (parsed.search ?? "");

      // ── Phase 1: connect ──
      emit({ type: "phase", phase: "connect", status: "active" });

      // DNS
      emit({ type: "lifecycle", step: "dns", status: "active" });
      const dnsStart = Date.now();
      let ip: string;
      try {
        ip = (await dns.lookup(hostname)).address;
      } catch (err) {
        emit({ type: "lifecycle", step: "dns", status: "error" });
        emit({ type: "error", message: `DNS failed: ${(err as Error).message}` });
        emit({ type: "done" }); controller.close(); return;
      }
      if (isBlockedIp(ip)) {
        emit({ type: "lifecycle", step: "dns", status: "error" });
        emit({ type: "error", message: `Blocked IP: ${ip} — private/reserved addresses are not allowed` });
        emit({ type: "done" }); controller.close(); return;
      }
      emit({ type: "lifecycle", step: "dns", status: "done", durationMs: Date.now() - dnsStart, resolvedIp: ip });

      // TCP
      emit({ type: "lifecycle", step: "tcp", status: "active" });
      const tcpStart = Date.now();
      const rawSocket = new net.Socket();
      try {
        await new Promise<void>((res, rej) => {
          rawSocket.connect(port, ip, res);
          rawSocket.once("error", rej);
        });
      } catch (err) {
        emit({ type: "lifecycle", step: "tcp", status: "error" });
        emit({ type: "error", message: `TCP connect failed: ${(err as Error).message}` });
        emit({ type: "done" }); controller.close(); return;
      }
      emit({ type: "lifecycle", step: "tcp", status: "done", durationMs: Date.now() - tcpStart });

      let socket: net.Socket | tls.TLSSocket = rawSocket;

      // TLS (wss only)
      if (isWss) {
        emit({ type: "lifecycle", step: "tls", status: "active" });
        const tlsStart = Date.now();
        try {
          socket = await new Promise<tls.TLSSocket>((res, rej) => {
            const s = tls.connect({ socket: rawSocket, servername: hostname, rejectUnauthorized: false });
            s.once("secureConnect", () => res(s));
            s.once("error", rej);
          });
        } catch (err) {
          emit({ type: "lifecycle", step: "tls", status: "error" });
          emit({ type: "error", message: `TLS failed: ${(err as Error).message}` });
          emit({ type: "done" }); controller.close(); return;
        }
        emit({ type: "lifecycle", step: "tls", status: "done", durationMs: Date.now() - tlsStart });
      }

      emit({ type: "phase", phase: "connect", status: "done", durationMs: Date.now() - sessionStart });

      // ── Phase 2: upgrade handshake ──
      const key            = generateKey();
      const upgradeRequest = buildUpgradeRequest(hostname, path, key);
      const { sha1Hex, accept } = computeAccept(key);

      emit({ type: "phase", phase: "handshake", status: "active" });
      emit({
        type:    "handshake_request",
        raw:     upgradeRequest,
        key,
        headers: {
          "Host":                  hostname,
          "Upgrade":               "websocket",
          "Connection":            "Upgrade",
          "Sec-WebSocket-Key":     key,
          "Sec-WebSocket-Version": "13",
        },
      });

      socket.write(upgradeRequest);
      const { raw: responseRaw, leftover: realLeftover } = await readHeaders(socket);

      const statusLine = responseRaw.split("\r\n")[0] ?? "";
      const statusCode = parseInt(statusLine.split(" ")[1] ?? "0");

      if (statusCode !== 101) {
        emit({
          type:       "error",
          message:    `Server responded with ${statusCode} instead of 101 Switching Protocols`,
          raw:        responseRaw,
          statusCode,
        });
        emit({ type: "done" });
        socket.destroy();
        controller.close();
        return;
      }

      // RFC 6455 §4.1 — validate Sec-WebSocket-Accept
      const acceptMatch = responseRaw.match(/Sec-WebSocket-Accept:\s*(.+)\r\n/i);
      const serverAccept = acceptMatch?.[1]?.trim() ?? "";
      if (serverAccept !== accept) {
        emit({
          type:    "error",
          message: serverAccept
            ? `Sec-WebSocket-Accept mismatch — server sent "${serverAccept}", expected "${accept}" (RFC 6455 §4.1)`
            : `Server did not send Sec-WebSocket-Accept header (RFC 6455 §4.1)`,
          raw:     responseRaw,
        });
        emit({ type: "done" });
        socket.destroy();
        controller.close();
        return;
      }

      emit({
        type:       "handshake_response",
        raw:        responseRaw,
        statusCode,
        accept,
        acceptValid: true,
        derivation: { key, guid: WS_GUID, input: key + WS_GUID, sha1Hex, accept },
        elapsedMs:  Date.now() - sessionStart,
      });

      emit({ type: "phase", phase: "handshake", status: "done" });

      // ── Keep socket alive: create session ──
      const sessionId = crypto.randomUUID();
      const realSession = createWsSession(sessionId, socket);
      if (realLeftover.length > 0) injectData(realSession, realLeftover);

      emit({ type: "connected", sessionId, elapsedMs: Date.now() - sessionStart });
      emit({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
