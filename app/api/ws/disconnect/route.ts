import { NextRequest } from "next/server";
import { getWsSession, encodeCloseFrame, destroyWsSession } from "@/lib/ws-sessions";

export const runtime = "nodejs";

interface DisconnectBody {
  sessionId: string;
}

export async function POST(req: NextRequest) {
  let body: DisconnectBody;
  try { body = await req.json(); }
  catch {
    return json({ error: "Invalid body" }, 400);
  }

  const { sessionId } = body;
  if (!sessionId) return json({ error: "sessionId is required" }, 400);

  const session = getWsSession(sessionId);
  if (session && !session.closed) {
    // Send a proper WebSocket close frame (code 1000 — normal closure)
    // then give the server up to 500ms to echo it back before we tear down.
    try { session.socket.write(encodeCloseFrame()); } catch { /* ignore */ }
    await new Promise<void>((r) => setTimeout(r, 500));
  }

  destroyWsSession(sessionId);

  return json({ ok: true });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
