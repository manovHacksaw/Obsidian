import { NextRequest } from "next/server";
import * as dns  from "node:dns";
import * as net  from "node:net";
import * as tls  from "node:tls";
import { performance } from "node:perf_hooks";
import { isBlockedIp } from "@/lib/ip-guard";

export const runtime = "nodejs";

type HttpVersion = "0.9" | "1.0" | "1.1";

// ────────────────────────────────────────────────────────────────
// LOOPBACK mode — we ARE the server
// ────────────────────────────────────────────────────────────────

const LOOPBACK_BODY = "<html>\n  <body>Hello World</body>\n</html>";

function makeServerHandler(version: HttpVersion): (socket: net.Socket) => void {
  return (socket: net.Socket) => {
    let buf = "";

    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("binary");

      if (version === "0.9") {
        if (buf.includes("\r\n")) {
          socket.write(LOOPBACK_BODY);
          socket.end();
        }
      } else if (version === "1.0") {
        if (buf.includes("\r\n\r\n")) {
          const resp =
            "HTTP/1.0 200 OK\r\n" +
            "Content-Type: text/html\r\n" +
            `Content-Length: ${Buffer.byteLength(LOOPBACK_BODY)}\r\n` +
            "Server: ObsidianSim/1.0\r\n" +
            "\r\n" +
            LOOPBACK_BODY;
          socket.write(resp);
          socket.end();
        }
      } else {
        if (buf.includes("\r\n\r\n")) {
          const chunkSize = Buffer.byteLength(LOOPBACK_BODY).toString(16);
          const resp =
            "HTTP/1.1 200 OK\r\n" +
            "Content-Type: text/html\r\n" +
            "Transfer-Encoding: chunked\r\n" +
            "Connection: keep-alive\r\n" +
            "Server: ObsidianSim/1.1\r\n" +
            "\r\n" +
            `${chunkSize}\r\n` +
            LOOPBACK_BODY +
            "\r\n0\r\n\r\n";
          socket.write(resp);
          setTimeout(() => socket.end(), 250);
        }
      }
    });

    socket.on("error", () => {});
  };
}

// ────────────────────────────────────────────────────────────────
// REAL mode — hit an actual server
// ────────────────────────────────────────────────────────────────

interface Target {
  host:   string;
  port:   number;
  path:   string;
  useTls: boolean;
}

function parseTarget(urlStr: string, version: HttpVersion): Target {
  let s = urlStr.trim();
  // If no scheme, guess based on version (0.9/1.0 predate HTTPS, 1.1 default to https)
  if (!s.match(/^https?:\/\//i)) {
    s = (version === "1.1" ? "https://" : "http://") + s;
  }
  const u      = new URL(s);
  const useTls = u.protocol === "https:";
  const port   = u.port ? parseInt(u.port, 10) : (useTls ? 443 : 80);
  const path   = (u.pathname || "/") + (u.search || "");
  return { host: u.hostname, port, path, useTls };
}

// Builds the exact bytes we put on the wire for each version.
// HTTP/0.9 has NO headers at all — that's the lesson.
// HTTP/1.0 has no Host header — that's why virtual hosting was impossible.
// HTTP/1.1 requires Host and sends Connection: close so we know when to stop reading.
function buildRequest(version: HttpVersion, path: string, host: string): string {
  if (version === "0.9") return `GET ${path}\r\n`;
  if (version === "1.0") {
    return (
      `GET ${path} HTTP/1.0\r\n` +
      "Accept: */*\r\n" +
      "User-Agent: ObsidianSim/1.0\r\n" +
      "\r\n"
    );
  }
  return (
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${host}\r\n` +
    "Connection: close\r\n" +
    "Accept: */*\r\n" +
    "User-Agent: ObsidianSim/1.1\r\n" +
    "\r\n"
  );
}

// ────────────────────────────────────────────────────────────────
// Response parser (shared)
// ────────────────────────────────────────────────────────────────

interface ParsedResponse {
  statusLine?: string;
  headers?:    Record<string, string>;
  body:        string;
  hasStatusLine: boolean;
  hasHeaders:    boolean;
  persistent:    boolean;
}

function decodeChunked(raw: string): string {
  let out = "";
  let pos = 0;
  while (pos < raw.length) {
    const nl = raw.indexOf("\r\n", pos);
    if (nl === -1) break;
    const size = parseInt(raw.slice(pos, nl), 16);
    if (isNaN(size) || size === 0) break;
    out += raw.slice(nl + 2, nl + 2 + size);
    pos = nl + 2 + size + 2;
  }
  return out;
}

function parseResponse(version: HttpVersion, raw: string, requestedClose: boolean): ParsedResponse {
  if (version === "0.9") {
    return { body: raw, hasStatusLine: false, hasHeaders: false, persistent: false };
  }

  // Real server might still respond with HTTP/1.x even if we sent 0.9/1.0
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1) {
    // No header/body separator — treat entire thing as body (like 0.9)
    return { body: raw, hasStatusLine: false, hasHeaders: false, persistent: false };
  }

  const headerSection = raw.slice(0, sep);
  let body = raw.slice(sep + 4);
  const lines = headerSection.split("\r\n");
  const statusLine = lines[0];
  const headers: Record<string, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const colon = lines[i].indexOf(":");
    if (colon !== -1) {
      headers[lines[i].slice(0, colon).trim().toLowerCase()] =
        lines[i].slice(colon + 1).trim();
    }
  }

  // Decode chunked if server used it
  if (headers["transfer-encoding"]?.toLowerCase().includes("chunked")) {
    body = decodeChunked(body);
  }

  const persistent = !requestedClose &&
    (headers["connection"]?.toLowerCase() === "keep-alive" || version === "1.1");

  return { statusLine, headers, body, hasStatusLine: true, hasHeaders: true, persistent };
}

// ────────────────────────────────────────────────────────────────
// Route handler
// ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const params  = new URL(req.url).searchParams;
  const version = (params.get("version") ?? "1.1") as HttpVersion;
  const urlParam = params.get("url") ?? "";

  if (!["0.9", "1.0", "1.1"].includes(version)) {
    return new Response(JSON.stringify({ error: "Invalid version" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const useLoopback = urlParam === "";

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        if (useLoopback) {
          // ── Loopback mode ──────────────────────────────────────
          const server = net.createServer(makeServerHandler(version));
          try {
            await new Promise<void>((resolve, reject) => {
              server.once("error", reject);
              server.listen(0, "127.0.0.1", resolve);
            });
            const { port } = server.address() as net.AddressInfo;

            emit({ type: "phase", phase: "tcp", status: "active" });
            const t0 = performance.now();
            const socket = await new Promise<net.Socket>((resolve, reject) => {
              const s = net.createConnection({ host: "127.0.0.1", port }, () => resolve(s));
              s.once("error", reject);
            });
            const tcpMs = Math.round(performance.now() - t0);
            emit({ type: "phase", phase: "tcp", status: "done", durationMs: tcpMs });

            emit({ type: "phase", phase: "request", status: "active" });
            const t1 = performance.now();
            const reqStr = version === "0.9" ? "GET /hello.html\r\n"
              : version === "1.0" ? "GET /hello.html HTTP/1.0\r\nAccept: */*\r\nUser-Agent: ObsidianSim/1.0\r\n\r\n"
              : "GET /hello.html HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\nAccept: */*\r\nUser-Agent: ObsidianSim/1.1\r\n\r\n";
            await new Promise<void>((res, rej) => socket.write(Buffer.from(reqStr), (e) => e ? rej(e) : res()));
            const requestMs = Math.round(performance.now() - t1);
            emit({ type: "phase", phase: "request", status: "done", durationMs: requestMs, rawBytes: reqStr });

            emit({ type: "phase", phase: "response", status: "active" });
            const t2 = performance.now();
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              socket.on("data", (c: Buffer) => {
                chunks.push(c);
                if (version === "1.1" && Buffer.concat(chunks).toString().includes("\r\n0\r\n\r\n")) resolve();
              });
              socket.once("end", resolve);
              socket.once("error", reject);
            });
            const responseMs = Math.round(performance.now() - t2);
            const rawResp = Buffer.concat(chunks).toString();
            emit({ type: "phase", phase: "response", status: "done", durationMs: responseMs, rawBytes: rawResp });

            let persistMs = 0;
            if (version === "1.1") {
              emit({ type: "phase", phase: "persist", status: "active" });
              const t3 = performance.now();
              await new Promise<void>((r) => { socket.once("end", r); socket.once("close", r); setTimeout(r, 400); });
              persistMs = Math.round(performance.now() - t3);
              emit({ type: "phase", phase: "persist", status: "done", durationMs: persistMs });
            }

            socket.destroy();
            emit({ type: "phase", phase: "close", status: "done", durationMs: 0 });

            const parsed  = parseResponse(version, rawResp, false);
            const totalMs = tcpMs + requestMs + responseMs + persistMs;
            emit({ type: "result", ...parsed, totalMs, rawRequest: reqStr, rawResponse: rawResp });
          } finally {
            server.close();
          }

        } else {
          // ── Real URL mode ──────────────────────────────────────
          let target: Target;
          try {
            target = parseTarget(urlParam, version);
          } catch {
            emit({ type: "error", message: `Invalid URL: ${urlParam}` });
            return;
          }

          const { host, port, path, useTls } = target;

          // DNS
          emit({ type: "phase", phase: "dns", status: "active" });
          const tDns = performance.now();
          const ip = await new Promise<string>((resolve, reject) => {
            dns.lookup(host, (err, addr) => err ? reject(err) : resolve(addr));
          });
          if (isBlockedIp(ip)) {
            emit({ type: "error", message: "Target resolves to a private or reserved IP address" });
            return;
          }
          const dnsMs = Math.round(performance.now() - tDns);
          emit({ type: "phase", phase: "dns", status: "done", durationMs: dnsMs, ip });

          // TCP
          emit({ type: "phase", phase: "tcp", status: "active" });
          const tTcp = performance.now();
          const rawSocket = await new Promise<net.Socket>((resolve, reject) => {
            const s = net.createConnection({ host: ip, port }, () => resolve(s));
            s.once("error", reject);
          });
          const tcpMs = Math.round(performance.now() - tTcp);
          emit({ type: "phase", phase: "tcp", status: "done", durationMs: tcpMs });

          // TLS (optional)
          let socket: net.Socket | tls.TLSSocket = rawSocket;
          let tlsMs = 0;
          if (useTls) {
            emit({ type: "phase", phase: "tls", status: "active" });
            const tTls = performance.now();
            socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
              const t = tls.connect({ socket: rawSocket, servername: host, rejectUnauthorized: false }, () => resolve(t));
              t.once("error", reject);
            });
            tlsMs = Math.round(performance.now() - tTls);
            emit({ type: "phase", phase: "tls", status: "done", durationMs: tlsMs });
          }

          // Request
          emit({ type: "phase", phase: "request", status: "active" });
          const tReq = performance.now();
          const reqStr = buildRequest(version, path, host);
          await new Promise<void>((res, rej) => socket.write(Buffer.from(reqStr), (e) => e ? rej(e) : res()));
          const requestMs = Math.round(performance.now() - tReq);
          emit({ type: "phase", phase: "request", status: "done", durationMs: requestMs, rawBytes: reqStr });

          // Response
          emit({ type: "phase", phase: "response", status: "active" });
          const tRes = performance.now();
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            socket.on("data", (c: Buffer) => chunks.push(c));
            socket.once("end", resolve);
            socket.once("error", reject);
            // Safety timeout — some servers never close on 0.9 requests
            setTimeout(resolve, 10000);
          });
          const responseMs = Math.round(performance.now() - tRes);
          const rawResp = Buffer.concat(chunks).toString();
          emit({ type: "phase", phase: "response", status: "done", durationMs: responseMs, rawBytes: rawResp });

          socket.destroy();
          emit({ type: "phase", phase: "close", status: "done", durationMs: 0 });

          const parsed = parseResponse(version, rawResp, true);
          const totalMs = dnsMs + tcpMs + tlsMs + requestMs + responseMs;
          emit({ type: "result", ...parsed, totalMs, rawRequest: reqStr, rawResponse: rawResp });
        }
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  });
}
