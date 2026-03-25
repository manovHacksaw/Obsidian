import { NextRequest } from "next/server";
import * as dns from "node:dns";
import * as net from "node:net";
import * as tls from "node:tls";
import { performance } from "node:perf_hooks";
import { isBlockedIp } from "@/lib/ip-guard";

export const runtime = "nodejs";
// ⚠ Vercel Pro: export const maxDuration = 30
// ⚠ Vercel Hobby (10s limit): keep timeoutMs ≤ 8000

interface LongPollRequest {
  mode:             "virtual" | "real";
  // virtual
  sessionStartedAt?: number;
  firedEventIds?:   string[];
  // real
  url?:             string;
  // both
  timeoutMs:        number;
}

// Virtual event definitions (mirrors constants.ts — kept inline to avoid
// importing client-side code into a server route)
const VIRTUAL_EVENTS = [
  { id: "lpe1", delayMs: 6000,  label: "Order filled",
    body: '{\n  "type": "order_filled",\n  "orderId": "ORD-9821",\n  "symbol": "BTC-USD",\n  "price": 67520,\n  "qty": 0.25\n}' },
  { id: "lpe2", delayMs: 14000, label: "New message",
    body: '{\n  "type": "message",\n  "from": "carol",\n  "text": "Long polling works great for chat!"\n}' },
  { id: "lpe3", delayMs: 22000, label: "Alert fired",
    body: '{\n  "type": "alert",\n  "severity": "high",\n  "message": "CPU usage above 90%"\n}' },
];

export async function POST(req: NextRequest) {
  let body: LongPollRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { mode, timeoutMs = 5000, sessionStartedAt, firedEventIds = [], url } = body;
  const hardCap = Math.min(timeoutMs, 28000); // safety rail for deployment limits

  const encoder = new TextEncoder();

  function emit(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  // ── Virtual mode ─────────────────────────────────────────────
  if (mode === "virtual") {
    const stream = new ReadableStream({
      async start(controller) {
        // 1. Connect phase (simulated DNS + TCP)
        const connectStart = performance.now();
        emit(controller, { type: "phase", phase: "connect", status: "active" });
        await new Promise<void>((r) => setTimeout(r, 28 + Math.floor(Math.random() * 20)));
        const connectMs = Math.round(performance.now() - connectStart);
        emit(controller, { type: "phase", phase: "connect", status: "done", durationMs: connectMs });

        // 2. Hold phase — emit ticks every 500ms while waiting for an event
        const holdStart   = performance.now();
        const sessionStart = sessionStartedAt ?? Date.now();
        const firedSet    = new Set(firedEventIds);

        emit(controller, { type: "phase", phase: "hold", status: "active" });

        let tickInterval: ReturnType<typeof setInterval> | null = null;
        let resolved = false;

        const result = await new Promise<
          | { status: "data"; body: string; label: string; eventId: string; holdMs: number }
          | { status: "timeout"; holdMs: number }
        >((resolve) => {
          tickInterval = setInterval(() => {
            if (resolved) return;
            const elapsed = Math.round(performance.now() - holdStart);

            // Check if an event fires
            const now = Date.now();
            const due = VIRTUAL_EVENTS.find(
              (e) => !firedSet.has(e.id) && e.delayMs <= (now - sessionStart)
            );

            if (due) {
              resolved = true;
              clearInterval(tickInterval!);
              resolve({ status: "data", body: due.body, label: due.label, eventId: due.id, holdMs: elapsed });
              return;
            }

            if (elapsed >= hardCap) {
              resolved = true;
              clearInterval(tickInterval!);
              resolve({ status: "timeout", holdMs: elapsed });
              return;
            }

            emit(controller, { type: "hold_tick", elapsedMs: elapsed });
          }, 400);
        });

        const holdMs = result.holdMs;
        emit(controller, { type: "phase", phase: "hold", status: "done", durationMs: holdMs });

        // 3. Respond phase
        const respondStart = performance.now();
        emit(controller, { type: "phase", phase: "respond", status: "active" });
        await new Promise<void>((r) => setTimeout(r, 15 + Math.floor(Math.random() * 12)));
        const respondMs = Math.round(performance.now() - respondStart);
        emit(controller, { type: "phase", phase: "respond", status: "done", durationMs: respondMs });

        if (result.status === "data") {
          emit(controller, {
            type: "respond",
            status: "data",
            holdMs,
            respondMs,
            body: result.body,
            label: result.label,
            eventId: result.eventId,
          });
        } else {
          emit(controller, { type: "respond", status: "timeout", holdMs, respondMs });
        }

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

  // ── Real mode ─────────────────────────────────────────────────
  if (!url) {
    return new Response(JSON.stringify({ error: "URL required for real mode" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Parse URL up-front so we can fail fast before opening the stream.
  let parsed: URL;
  try { parsed = new URL(url); }
  catch {
    return new Response(JSON.stringify({ error: `Invalid URL: ${url}` }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const isHttps  = parsed.protocol === "https:";
  const hostname = parsed.hostname;
  const port     = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);
  const path     = (parsed.pathname || "/") + parsed.search;

  const stream = new ReadableStream({
    async start(controller) {

      // ── 1. Connect phase: real DNS + TCP + TLS ──────────────
      const connectStart = performance.now();
      emit(controller, { type: "phase", phase: "connect", status: "active" });

      // DNS
      let ip: string;
      try {
        ip = await new Promise<string>((resolve, reject) => {
          if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
            resolve("127.0.0.1"); return;
          }
          dns.lookup(hostname, { family: 4 }, (err, addr) => {
            if (err) reject(new Error(`DNS lookup failed: ${err.message}`));
            else resolve(addr);
          });
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - connectStart);
        emit(controller, { type: "phase", phase: "connect", status: "error", durationMs });
        emit(controller, { type: "error", message: (err as Error).message });
        controller.close(); return;
      }

      if (isBlockedIp(ip)) {
        const durationMs = Math.round(performance.now() - connectStart);
        emit(controller, { type: "phase", phase: "connect", status: "error", durationMs });
        emit(controller, { type: "error", message: "Target resolves to a private or reserved IP address" });
        controller.close(); return;
      }

      // TCP
      let rawSocket: net.Socket;
      try {
        rawSocket = await new Promise<net.Socket>((resolve, reject) => {
          const s = net.createConnection({ host: ip, port, timeout: 10000 });
          s.once("connect", () => resolve(s));
          s.once("timeout", () => { s.destroy(); reject(new Error("TCP connection timed out")); });
          s.once("error",   (e) => reject(new Error(`TCP error: ${e.message}`)));
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - connectStart);
        emit(controller, { type: "phase", phase: "connect", status: "error", durationMs });
        emit(controller, { type: "error", message: (err as Error).message });
        controller.close(); return;
      }

      // TLS (HTTPS only)
      let activeSocket: net.Socket | tls.TLSSocket = rawSocket;
      if (isHttps) {
        try {
          activeSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
            const tlsSock = tls.connect({ socket: rawSocket, servername: hostname, rejectUnauthorized: false });
            tlsSock.once("secureConnect", () => resolve(tlsSock));
            tlsSock.once("error", (e) => { rawSocket.destroy(); reject(new Error(`TLS error: ${e.message}`)); });
          });
        } catch (err) {
          const durationMs = Math.round(performance.now() - connectStart);
          emit(controller, { type: "phase", phase: "connect", status: "error", durationMs });
          emit(controller, { type: "error", message: (err as Error).message });
          controller.close(); return;
        }
      }

      const connectMs = Math.round(performance.now() - connectStart);
      emit(controller, { type: "phase", phase: "connect", status: "done", durationMs: connectMs });

      // ── 2. Hold phase: write request, wait for first byte ───
      // In long polling the "hold" is the time the server keeps the connection
      // open before responding — equivalent to TTFB for a slow response.
      emit(controller, { type: "phase", phase: "hold", status: "active" });
      const holdStart = performance.now();

      const defaultPort = isHttps ? 443 : 80;
      const hostHeader  = port !== defaultPort ? `${hostname}:${port}` : hostname;
      const requestRaw  = [
        `GET ${path || "/"} HTTP/1.1`,
        `Host: ${hostHeader}`,
        `Connection: close`,
        `User-Agent: ObsidianSim/1.0`,
        `Accept: */*`,
      ].join("\r\n") + "\r\n\r\n";

      activeSocket.write(requestRaw, "utf8");

      // Tick interval animates the hold counter while we wait for first byte.
      const tickIntervalId = setInterval(() => {
        emit(controller, { type: "hold_tick", elapsedMs: Math.round(performance.now() - holdStart) });
      }, 400);

      // Collect all data; record TTFB and download separately.
      const result = await new Promise<{
        respondStatus: "data" | "timeout" | "error";
        holdMs:        number;
        respondMs:     number;
        body:          string;
        httpStatus:    number;
        httpStatusText: string;
        httpHeaders:   Record<string, string>;
        errorMsg?:     string;
      }>((resolve) => {
        const chunks: Buffer[] = [];
        let ttfbMs: number | null = null;
        let downloadStart         = 0;
        let settled               = false;

        function settle(r: Parameters<typeof resolve>[0]) {
          if (settled) return;
          settled = true;
          clearInterval(tickIntervalId);
          resolve(r);
        }

        // Hard timeout — no first byte within hardCap → treat as server timeout.
        const timeoutId = setTimeout(() => {
          activeSocket.destroy();
          settle({
            respondStatus: "timeout",
            holdMs:        hardCap,
            respondMs:     0,
            body: "", httpStatus: 0, httpStatusText: "", httpHeaders: {},
          });
        }, hardCap);

        activeSocket.on("data", (chunk: Buffer) => {
          if (ttfbMs === null) {
            // First byte received — hold phase ends here.
            ttfbMs        = Math.round(performance.now() - holdStart);
            downloadStart = performance.now();
            clearTimeout(timeoutId); // data is flowing; timeout no longer needed
          }
          chunks.push(chunk);
        });

        activeSocket.once("end", () => {
          clearTimeout(timeoutId);

          if (ttfbMs === null) {
            // Server closed the connection without sending any data.
            settle({
              respondStatus: "timeout",
              holdMs:        Math.round(performance.now() - holdStart),
              respondMs:     0,
              body: "", httpStatus: 0, httpStatusText: "", httpHeaders: {},
            });
            return;
          }

          const respondMs = Math.round(performance.now() - downloadStart);

          // Parse HTTP/1.1 response
          const raw      = Buffer.concat(chunks).toString("utf8");
          const splitIdx = raw.indexOf("\r\n\r\n");
          const headerSection = splitIdx >= 0 ? raw.slice(0, splitIdx)     : raw;
          const bodySection   = splitIdx >= 0 ? raw.slice(splitIdx + 4)    : "";
          const headerLines   = headerSection.split("\r\n");
          const statusLine    = headerLines[0] ?? "HTTP/1.1 0 Unknown";
          const parts         = statusLine.split(" ");
          const httpStatus    = parseInt(parts[1] ?? "0", 10);
          const httpStatusText = parts.slice(2).join(" ");

          const httpHeaders: Record<string, string> = {};
          for (const line of headerLines.slice(1)) {
            const colon = line.indexOf(":");
            if (colon > -1) {
              httpHeaders[line.slice(0, colon).toLowerCase().trim()] = line.slice(colon + 1).trim();
            }
          }

          // Decode chunked transfer encoding if present
          let body = bodySection;
          if ((httpHeaders["transfer-encoding"] ?? "").toLowerCase().includes("chunked")) {
            body = "";
            let remaining = bodySection;
            while (remaining.length > 0) {
              const crlfIdx = remaining.indexOf("\r\n");
              if (crlfIdx === -1) break;
              const chunkSize = parseInt(remaining.slice(0, crlfIdx), 16);
              if (isNaN(chunkSize) || chunkSize === 0) break;
              body      += remaining.slice(crlfIdx + 2, crlfIdx + 2 + chunkSize);
              remaining  = remaining.slice(crlfIdx + 2 + chunkSize + 2);
            }
          }

          settle({
            respondStatus: "data",
            holdMs:        ttfbMs!,
            respondMs,
            body:          body.slice(0, 10240),
            httpStatus,
            httpStatusText,
            httpHeaders,
          });
        });

        activeSocket.once("error", (err: Error) => {
          clearTimeout(timeoutId);
          const isAbort = err.message?.toLowerCase().includes("destroyed");
          settle({
            respondStatus: isAbort ? "timeout" : "error",
            holdMs:        Math.round(performance.now() - holdStart),
            respondMs:     0,
            body: "", httpStatus: 0, httpStatusText: "", httpHeaders: {},
            errorMsg: err.message,
          });
        });
      });

      const { respondStatus, holdMs, respondMs, body, httpStatus, httpStatusText, httpHeaders, errorMsg } = result;

      emit(controller, { type: "phase", phase: "hold", status: "done", durationMs: holdMs });

      // ── 3. Respond phase: actual body download time ──────────
      emit(controller, { type: "phase", phase: "respond", status: "active" });
      emit(controller, { type: "phase", phase: "respond", status: "done", durationMs: respondMs });

      if (respondStatus === "data") {
        emit(controller, {
          type:          "respond",
          status:        "data",
          holdMs,
          respondMs,
          body,
          headers:       httpHeaders,
          httpStatus,
          httpStatusText,
        });
      } else if (respondStatus === "timeout") {
        emit(controller, { type: "respond", status: "timeout", holdMs, respondMs });
      } else {
        emit(controller, { type: "respond", status: "error", holdMs, respondMs, message: errorMsg });
      }

      // Clean up socket
      if (!activeSocket.destroyed) {
        try { activeSocket.end(); } catch { /* no-op */ }
        activeSocket.destroy();
      }

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
