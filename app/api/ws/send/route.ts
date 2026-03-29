import { NextRequest } from "next/server";
import * as crypto from "crypto";
import { getWsSession, encodeTextFrame } from "@/lib/ws-sessions";

export const runtime = "nodejs";

interface SendBody {
  sessionId: string;
  text:      string;
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try { body = await req.json(); }
  catch {
    return json({ error: "Invalid body" }, 400);
  }

  const { sessionId, text } = body;

  if (!sessionId || typeof text !== "string") {
    return json({ error: "sessionId and text are required" }, 400);
  }

  if (text.length > 4096) {
    return json({ error: "Message too long (max 4096 bytes)" }, 400);
  }

  const session = getWsSession(sessionId);
  if (!session) return json({ error: "Session not found" }, 404);
  if (session.closed) return json({ error: "Connection is closed" }, 410);

  const { frame, detail } = encodeTextFrame(text);

  try {
    session.socket.write(frame);
  } catch (err) {
    return json({ error: `Write failed: ${(err as Error).message}` }, 500);
  }

  return json({
    ok: true,
    message: {
      id:        crypto.randomUUID(),
      direction: "sent",
      timestamp: Date.now(),
      text,
      frame:     detail,
    },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
