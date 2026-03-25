import { NextRequest } from "next/server";
import * as net from "net";

export const runtime = "nodejs";

// ── Loopback endpoints ────────────────────────────────────────────
// /slow intentionally delays 2000ms — the HOL blocker.
// /fast1 and /fast2 respond instantly.

const ENDPOINTS = [
  { path: "/slow",  delayMs: 2000 },
  { path: "/fast1", delayMs:    0 },
  { path: "/fast2", delayMs:    0 },
] as const;

function makeHttpResponse(path: string): Buffer {
  const body = `ok:${path}`;
  const head = `HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\nContent-Type: text/plain\r\nConnection: keep-alive\r\n\r\n`;
  return Buffer.from(head + body, "latin1");
}

// Returns the number of bytes consumed if buf holds a complete HTTP/1.1 response,
// or null if the response is not yet complete.
function consumeResponse(buf: string): number | null {
  const hEnd = buf.indexOf("\r\n\r\n");
  if (hEnd === -1) return null;
  const clMatch = buf.slice(0, hEnd).match(/content-length:\s*(\d+)/i);
  const cl      = clMatch ? parseInt(clMatch[1], 10) : 0;
  const total   = hEnd + 4 + cl;
  return buf.length >= total ? total : null;
}

// ── Loopback TCP server ───────────────────────────────────────────

function startServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buf = "";
      socket.on("data", (chunk) => {
        buf += chunk.toString("latin1");
        // Parse and respond to each complete HTTP request
        let idx: number;
        while ((idx = buf.indexOf("\r\n\r\n")) !== -1) {
          const head = buf.slice(0, idx + 4);
          buf        = buf.slice(idx + 4);
          const path = head.split(" ")[1] ?? "/";
          const ep   = ENDPOINTS.find((e) => e.path === path);
          const delay = ep?.delayMs ?? 0;
          setTimeout(() => {
            if (!socket.destroyed) socket.write(makeHttpResponse(path));
          }, delay);
        }
      });
      socket.on("error", () => {});
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
    server.once("error", reject);
  });
}

// ── GET handler ───────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {}
      }

      let srv: { port: number; close: () => Promise<void> };
      try {
        srv = await startServer();
      } catch (err) {
        emit({ type: "error", message: String(err) });
        emit({ type: "done" });
        controller.close();
        return;
      }

      emit({ type: "server_ready", port: srv.port });

      const sessionStart = Date.now();

      // ══════════════════════════════════════════════════════════════
      // Phase 1 — HTTP/1.1 HOL
      //
      // ONE connection. All three requests are pipelined (sent back-to-back
      // before any response arrives). The server processes them in order —
      // /fast1 and /fast2 cannot be delivered until /slow finishes.
      // ══════════════════════════════════════════════════════════════

      emit({ type: "phase", phase: "hol", status: "start" });

      {
        const sock = new net.Socket();
        await new Promise<void>((res, rej) => {
          sock.connect(srv.port, "127.0.0.1", res);
          sock.once("error", rej);
        });

        // 1a. Pipeline all requests without waiting for responses
        const sentMs: Record<string, number> = {};
        for (const ep of ENDPOINTS) {
          sentMs[ep.path] = Date.now() - sessionStart;
          sock.write(
            `GET ${ep.path} HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n`
          );
          emit({ type: "request_sent", phase: "hol", path: ep.path, sentMs: sentMs[ep.path] });
        }

        // 1b. Read responses in order
        let respBuf = "";
        let pendingIdx = 0;

        // Use a queue of one-shot resolvers
        const resolvers: (() => void)[] = ENDPOINTS.map(() => () => {});
        const promises                  = ENDPOINTS.map(
          (_, i) => new Promise<void>((r) => { resolvers[i] = r; })
        );

        sock.on("data", (chunk: Buffer) => {
          respBuf += chunk.toString("latin1");
          while (pendingIdx < ENDPOINTS.length) {
            const consumed = consumeResponse(respBuf);
            if (consumed === null) break;
            respBuf = respBuf.slice(consumed);
            resolvers[pendingIdx]();
            pendingIdx++;
          }
        });
        sock.on("error", () => {});

        for (let i = 0; i < ENDPOINTS.length; i++) {
          await promises[i];
          emit({
            type:        "response_received",
            phase:       "hol",
            path:        ENDPOINTS[i].path,
            sentMs:      sentMs[ENDPOINTS[i].path],
            receivedMs:  Date.now() - sessionStart,
          });
        }

        sock.destroy();
      }

      emit({ type: "phase", phase: "hol", status: "done" });

      // Small pause so the client can render the HOL results before parallel phase
      await new Promise<void>((r) => setTimeout(r, 600));

      // ══════════════════════════════════════════════════════════════
      // Phase 2 — Parallel connections
      //
      // THREE connections, one request each, all launched simultaneously.
      // /fast1 and /fast2 finish in microseconds; /slow still takes 2s.
      // ══════════════════════════════════════════════════════════════

      emit({ type: "phase", phase: "parallel", status: "start" });

      await Promise.all(
        ENDPOINTS.map(async (ep) => {
          const sock = new net.Socket();
          await new Promise<void>((res, rej) => {
            sock.connect(srv.port, "127.0.0.1", res);
            sock.once("error", rej);
          });

          const sentMs = Date.now() - sessionStart;
          sock.write(
            `GET ${ep.path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`
          );
          emit({ type: "request_sent", phase: "parallel", path: ep.path, sentMs });

          let buf = "";
          await new Promise<void>((resolve) => {
            sock.on("data", (chunk: Buffer) => {
              buf += chunk.toString("latin1");
              if (consumeResponse(buf) !== null) resolve();
            });
            sock.on("close", resolve);
            sock.on("error", resolve);
          });

          emit({
            type:       "response_received",
            phase:      "parallel",
            path:       ep.path,
            sentMs,
            receivedMs: Date.now() - sessionStart,
          });
          sock.destroy();
        })
      );

      emit({ type: "phase", phase: "parallel", status: "done" });

      await srv.close();
      emit({ type: "done", totalMs: Date.now() - sessionStart });
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
