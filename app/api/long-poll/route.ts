import { NextRequest } from "next/server";
import { performance } from "node:perf_hooks";

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

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Connect phase (we report it immediately — the real hold is in the fetch)
      const connectStart = performance.now();
      emit(controller, { type: "phase", phase: "connect", status: "active" });
      const connectMs = Math.round(performance.now() - connectStart) + 8;
      emit(controller, { type: "phase", phase: "connect", status: "done", durationMs: connectMs });

      // 2. Hold phase — start the real fetch + tick loop concurrently
      emit(controller, { type: "phase", phase: "hold", status: "active" });

      const holdStart  = performance.now();
      const abort      = new AbortController();
      const timeoutId  = setTimeout(() => abort.abort(), hardCap);

      // Tick interval so frontend can animate the hold counter
      let tickIntervalId: ReturnType<typeof setInterval> | null = null;
      tickIntervalId = setInterval(() => {
        const elapsed = Math.round(performance.now() - holdStart);
        emit(controller, { type: "hold_tick", elapsedMs: elapsed });
      }, 400);

      let respondStatus: "data" | "timeout" | "error" = "timeout";
      let responseBody = "";
      let responseHeaders: Record<string, string> = {};
      let httpStatus = 0;
      let httpStatusText = "";
      let holdMs = hardCap;
      let errorMessage = "";

      try {
        const res = await fetch(url, {
          method: "GET",
          signal: abort.signal,
          headers: { "User-Agent": "ObsidianSim/1.0", "Accept": "*/*" },
        });
        holdMs = Math.round(performance.now() - holdStart);
        clearInterval(tickIntervalId!);
        clearTimeout(timeoutId);

        httpStatus     = res.status;
        httpStatusText = res.statusText;
        const rawHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => { rawHeaders[k] = v; });
        responseHeaders = rawHeaders;
        responseBody    = (await res.text()).slice(0, 10240);
        respondStatus   = "data";
      } catch (err) {
        holdMs = Math.round(performance.now() - holdStart);
        clearInterval(tickIntervalId!);
        clearTimeout(timeoutId);

        const msg = (err as Error).message ?? "";
        if (msg.includes("abort") || msg.includes("signal")) {
          respondStatus = "timeout";
        } else {
          respondStatus = "error";
          errorMessage  = msg;
        }
      }

      emit(controller, { type: "phase", phase: "hold", status: "done", durationMs: holdMs });

      // 3. Respond phase
      const respondStart = performance.now();
      emit(controller, { type: "phase", phase: "respond", status: "active" });
      await new Promise<void>((r) => setTimeout(r, 12));
      const respondMs = Math.round(performance.now() - respondStart);
      emit(controller, { type: "phase", phase: "respond", status: "done", durationMs: respondMs });

      if (respondStatus === "data") {
        emit(controller, {
          type:    "respond",
          status:  "data",
          holdMs,
          respondMs,
          body:    responseBody,
          headers: responseHeaders,
          httpStatus,
          httpStatusText,
        });
      } else if (respondStatus === "timeout") {
        emit(controller, { type: "respond", status: "timeout", holdMs, respondMs });
      } else {
        emit(controller, { type: "respond", status: "error",   holdMs, respondMs, message: errorMessage });
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
