/**
 * SSE stream for incoming WebSocket frames.
 *
 * The browser opens this as a persistent EventSource after the handshake.
 * Whenever the server-side WebSocket socket delivers a text/binary frame,
 * we push it here as a Server-Sent Event.
 *
 * Events emitted:
 *   { type: "message", id, direction: "received", timestamp, text, frame }
 *   { type: "closed" }   — when the WS connection closes (either end)
 *   { type: "error", message }
 */

import { NextRequest } from "next/server";
import { getWsSession, type WsMessage } from "@/lib/ws-sessions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  const session = getWsSession(sessionId);
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function emit(event: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* stream closed */ }
      }

      // If already closed before SSE stream opened, tell the client immediately.
      if (session.closed) {
        emit({ type: "closed" });
        controller.close();
        return;
      }

      // Drain any frames that arrived before the SSE stream was opened.
      for (const msg of session.queue.splice(0)) {
        emit({ type: "message", ...msg });
      }

      // Register live callbacks — called by ws-sessions frame parser as frames arrive.
      session.onMessage = (msg: WsMessage) => {
        emit({ type: "message", ...msg });
      };

      session.onClose = () => {
        emit({ type: "closed" });
        try { controller.close(); } catch { /* already closed */ }
      };
    },

    cancel() {
      // Browser disconnected from the SSE stream (e.g. tab closed, reset clicked).
      // Don't destroy the WS session — another stream may reconnect.
      if (session.onMessage) session.onMessage = undefined;
      if (session.onClose)   session.onClose   = undefined;
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
