import { NextRequest } from "next/server";
import { performance } from "node:perf_hooks";

export const runtime = "nodejs";
// ⚠ Vercel Pro: export const maxDuration = 30
// ⚠ Vercel Hobby (10s limit): virtual events finish in ~21s — use Pro or local dev

interface SSERequest {
  mode:              "virtual" | "real";
  sessionStartedAt?: number;
  url?:              string;
  timeoutMs?:        number;
}

// Virtual event definitions (mirrors constants.ts — kept inline to avoid
// importing client-side code into a server route)
const VIRTUAL_EVENTS = [
  { id: "sse1", delayMs:  3000, eventType: "notification", data: '{\n  "from": "alice",\n  "msg": "Hey, are you there?",\n  "ts": 1700000003\n}' },
  { id: "sse2", delayMs:  7000, eventType: "notification", data: '{\n  "from": "john",\n  "action": "liked your post",\n  "postId": "p-442"\n}' },
  { id: "sse3", delayMs: 11000, eventType: "alert",        data: '{\n  "severity": "high",\n  "msg": "CPU at 92%",\n  "host": "web-01"\n}' },
  { id: "sse4", delayMs: 16000, eventType: "notification", data: '{\n  "from": "github-bot",\n  "msg": "Tests passed ✓",\n  "pr": 142\n}' },
  { id: "sse5", delayMs: 21000, eventType: "close",        data: '{\n  "reason": "all events delivered"\n}' },
];

export async function POST(req: NextRequest) {
  let body: SSERequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { mode, url, timeoutMs = 30000 } = body;
  const encoder = new TextEncoder();

  function emit(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  // ── Virtual mode ─────────────────────────────────────────────
  if (mode === "virtual") {
    const stream = new ReadableStream({
      async start(controller) {
        const sessionStart = body.sessionStartedAt ?? Date.now();

        // 1. Connect phase — simulated as discrete DNS → TCP → TLS → Request steps
        emit(controller, { type: "phase", phase: "connect", status: "active" });

        const rand = (n: number) => Math.floor(Math.random() * n);

        // DNS lookup
        emit(controller, { type: "lifecycle", step: "dns", status: "active" });
        const dnsStart = performance.now();
        await new Promise<void>((r) => setTimeout(r, 8 + rand(8)));
        const dnsMs = Math.round(performance.now() - dnsStart);
        emit(controller, { type: "lifecycle", step: "dns", status: "done", durationMs: dnsMs });

        // TCP handshake
        emit(controller, { type: "lifecycle", step: "tcp", status: "active" });
        const tcpStart = performance.now();
        await new Promise<void>((r) => setTimeout(r, 5 + rand(8)));
        const tcpMs = Math.round(performance.now() - tcpStart);
        emit(controller, { type: "lifecycle", step: "tcp", status: "done", durationMs: tcpMs });

        // TLS handshake
        emit(controller, { type: "lifecycle", step: "tls", status: "active" });
        const tlsStart = performance.now();
        await new Promise<void>((r) => setTimeout(r, 8 + rand(10)));
        const tlsMs = Math.round(performance.now() - tlsStart);
        emit(controller, { type: "lifecycle", step: "tls", status: "done", durationMs: tlsMs });

        // HTTP request sent
        emit(controller, { type: "lifecycle", step: "request", status: "active" });
        const reqStart = performance.now();
        await new Promise<void>((r) => setTimeout(r, 3 + rand(5)));
        const reqMs = Math.round(performance.now() - reqStart);
        emit(controller, { type: "lifecycle", step: "request", status: "done", durationMs: reqMs });

        const connectMs = dnsMs + tcpMs + tlsMs + reqMs;
        emit(controller, { type: "phase", phase: "connect", status: "done", durationMs: connectMs });

        // Response headers received + stream opened
        emit(controller, { type: "lifecycle", step: "headers", status: "done", durationMs: 0 });
        emit(controller, { type: "lifecycle", step: "stream_open", status: "done", durationMs: 0 });

        // Emit virtual response headers so the client can display them
        emit(controller, {
          type: "response_headers",
          headers: {
            "Content-Type":      "text/event-stream",
            "Cache-Control":     "no-cache, no-transform",
            "Connection":        "keep-alive",
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
          },
        });

        // 2. Stream phase — deliver events at their scheduled delays
        emit(controller, { type: "phase", phase: "stream", status: "active" });

        const sorted = [...VIRTUAL_EVENTS].sort((a, b) => a.delayMs - b.delayMs);

        for (const evt of sorted) {
          // Wait until this event's scheduled delay has passed (from session start)
          const elapsed  = Date.now() - sessionStart;
          const remaining = evt.delayMs - elapsed;
          if (remaining > 0) {
            await new Promise<void>((r) => setTimeout(r, remaining));
          }
          const elapsedMs = Date.now() - sessionStart;
          emit(controller, {
            type:      "event",
            eventType: evt.eventType,
            id:        evt.id,
            data:      evt.data,
            elapsedMs,
          });
        }

        emit(controller, { type: "phase", phase: "stream", status: "done" });
        emit(controller, { type: "done" });
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

  const stream = new ReadableStream({
    async start(controller) {
      const sessionStart = Date.now();
      const abort        = new AbortController();
      // For real SSE streams the remote server never closes, so we don't apply
      // a timeout here — the user's Disconnect button is the intended stop mechanism.
      // We still apply a short safety timeout for the initial connect phase only.
      const connectTimeoutId = setTimeout(() => abort.abort(), 15000); // 15s to establish

      // 1. Connect phase (DNS+TCP+TLS+request lumped — we can't separate them in fetch)
      emit(controller, { type: "phase",     phase: "connect",   status: "active" });
      emit(controller, { type: "lifecycle", step:  "connect",   status: "active" });
      const connectStart = performance.now();

      let fetchRes: Response;
      try {
        fetchRes = await fetch(url, {
          method:  "GET",
          signal:  abort.signal,
          headers: {
            "Accept":        "text/event-stream",
            "Cache-Control": "no-cache",
            "User-Agent":    "ObsidianSim/1.0",
          },
        });
      } catch (err) {
        clearTimeout(connectTimeoutId);
        const connectMs = Math.round(performance.now() - connectStart);
        emit(controller, { type: "lifecycle", step: "connect", status: "error", durationMs: connectMs });
        emit(controller, { type: "phase",     phase: "connect", status: "error", durationMs: connectMs });
        emit(controller, { type: "error",     message: (err as Error).message ?? "Connection failed" });
        emit(controller, { type: "done" });
        controller.close();
        return;
      }

      // Connect succeeded — cancel the connect timeout, stream runs until user disconnects
      clearTimeout(connectTimeoutId);
      const connectMs   = Math.round(performance.now() - connectStart);
      const contentType = fetchRes.headers.get("content-type") ?? "";
      const isSSE       = contentType.includes("text/event-stream");

      emit(controller, { type: "lifecycle", step: "connect", status: "done", durationMs: connectMs });
      emit(controller, { type: "phase",     phase: "connect", status: "done", durationMs: connectMs });

      // Emit actual response headers for the headers panel
      const responseHeaders: Record<string, string> = {};
      fetchRes.headers.forEach((v, k) => { responseHeaders[k] = v; });
      emit(controller, { type: "lifecycle", step: "headers", status: "done", durationMs: 0 });
      emit(controller, { type: "response_headers", headers: responseHeaders });

      // Tell the client what kind of endpoint this is so the UI can fork its visualization
      emit(controller, {
        type:           "connection_info",
        isSSE,
        contentType,
        httpStatus:     fetchRes.status,
        httpStatusText: fetchRes.statusText,
      });

      // ── Non-SSE endpoint: single HTTP response ────────────────
      if (!isSSE) {
        emit(controller, { type: "phase", phase: "stream", status: "active" });

        const body      = fetchRes.body ? (await fetchRes.text()).slice(0, 10240) : "";
        const elapsedMs = Date.now() - sessionStart;
        // timeout already cleared after connect

        emit(controller, {
          type:           "event",
          eventType:      "response",
          data:           body,
          elapsedMs,
          httpStatus:     fetchRes.status,
          httpStatusText: fetchRes.statusText,
          headers:        responseHeaders,
          isSSE:          false,
        });
        emit(controller, { type: "phase", phase: "stream", status: "done" });
        emit(controller, { type: "done" });
        controller.close();
        return;
      }

      // ── SSE endpoint: proxy the stream ────────────────────────
      emit(controller, { type: "lifecycle", step: "stream_open", status: "done", durationMs: 0 });
      emit(controller, { type: "phase", phase: "stream", status: "active" });

      if (!fetchRes.body) {
        // timeout already cleared after connect
        emit(controller, { type: "phase", phase: "stream", status: "error" });
        emit(controller, { type: "done" });
        controller.close();
        return;
      }

      const reader  = fetchRes.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";
      let   currentEvent: { id?: string; eventType?: string; dataLines: string[] } = { dataLines: [] };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line === "") {
              // Empty line = dispatch event
              if (currentEvent.dataLines.length > 0) {
                const elapsedMs = Date.now() - sessionStart;
                emit(controller, {
                  type:      "event",
                  eventType: currentEvent.eventType ?? "message",
                  id:        currentEvent.id,
                  data:      currentEvent.dataLines.join("\n"),
                  elapsedMs,
                });
              }
              currentEvent = { dataLines: [] };
            } else if (line.startsWith("data:")) {
              currentEvent.dataLines.push(line.slice(5).trimStart());
            } else if (line.startsWith("event:")) {
              currentEvent.eventType = line.slice(6).trim();
            } else if (line.startsWith("id:")) {
              currentEvent.id = line.slice(3).trim();
            }
            // ignore retry: and comments
          }
        }
      } catch {
        // Stream ended or was aborted
      } finally {
        reader.cancel();
        // timeout already cleared after connect
      }

      emit(controller, { type: "phase", phase: "stream", status: "done" });
      emit(controller, { type: "done" });
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
