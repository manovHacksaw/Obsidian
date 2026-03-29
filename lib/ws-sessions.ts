/**
 * WebSocket session store.
 *
 * After the HTTP upgrade handshake completes, the live TCP socket is kept here
 * so that /api/ws/send, /api/ws/stream, and /api/ws/disconnect can operate on it
 * across separate HTTP requests.
 *
 * NOTE: This store is process-local (same globalThis constraint as sim-sessions).
 * Do not deploy to multi-process environments (serverless, multiple workers).
 */

import * as net    from "net";
import * as tls    from "tls";
import * as crypto from "crypto";

// ── Types ──────────────────────────────────────────────────────────

export interface FrameDetail {
  opcode:      number;
  opcodeLabel: string;
  fin:         boolean;
  rsv:         number;   // bits 6–4 of byte 0 (RSV1|RSV2|RSV3); must be 0 unless an extension was negotiated
  masked:      boolean;
  payloadLen:  number;
  maskingKey?: string;   // space-separated hex bytes, e.g. "a1 b2 c3 d4"
  rawHex:      string;   // first 64 bytes of the frame, hex
}

export interface WsMessage {
  id:        string;
  direction: "sent" | "received";
  timestamp: number;
  text:      string;
  frame:     FrameDetail;
}

export interface WsSession {
  socket:    net.Socket | tls.TLSSocket;
  server?:   net.Server;            // virtual mode only
  created:   number;
  recvBuf:   Buffer;
  queue:     WsMessage[];           // frames received before SSE stream opens
  onMessage?: (msg: WsMessage) => void;
  onClose?:   () => void;
  closed:    boolean;
}

// ── Opcode labels (RFC 6455 §5.2) ─────────────────────────────────

const OPCODE_LABELS: Record<number, string> = {
  0x00: "continuation",
  0x01: "text",
  0x02: "binary",
  0x08: "close",
  0x09: "ping",
  0x0a: "pong",
};

function opcodeLabel(op: number): string {
  return OPCODE_LABELS[op] ?? `reserved(0x${op.toString(16)})`;
}

// ── Store ──────────────────────────────────────────────────────────
// Pinned to globalThis so all route handlers share the same Map instance.
// Next.js can load ws-sessions.ts in separate module evaluation contexts
// (one per route bundle), so a plain module-level Map would not be shared.

const g = globalThis as typeof globalThis & { __wsSessions?: Map<string, WsSession> };
if (!g.__wsSessions) g.__wsSessions = new Map();
const store: Map<string, WsSession> = g.__wsSessions;

export function createWsSession(
  id:      string,
  socket:  net.Socket | tls.TLSSocket,
  server?: net.Server,
): WsSession {
  const session: WsSession = {
    socket,
    server,
    created:  Date.now(),
    recvBuf:  Buffer.alloc(0),
    queue:    [],
    closed:   false,
  };
  store.set(id, session);

  // Attach frame parser to the CLIENT socket (data from server → client).
  // Explicitly resume after attaching: readHeaders() removes its own data listener
  // which may leave the socket paused (Node.js ≥18 does not always auto-resume
  // when a new data listener is added after all previous ones were removed).
  socket.on("data", (chunk: Buffer) => {
    session.recvBuf = Buffer.concat([session.recvBuf, chunk]);
    flushFrames(session);
  });
  socket.resume();

  socket.once("close", () => markClosed(session));
  socket.once("error", () => markClosed(session));

  return session;
}

export function getWsSession(id: string): WsSession | undefined {
  return store.get(id);
}

export function destroyWsSession(id: string): void {
  const s = store.get(id);
  if (!s) return;
  s.closed = true;
  try { s.socket.destroy(); } catch { /* ignore */ }
  try { s.server?.close();  } catch { /* ignore */ }
  store.delete(id);
}

/** Feed bytes received before the SSE stream opened into the session buffer. */
export function injectData(session: WsSession, data: Buffer): void {
  if (data.length === 0) return;
  session.recvBuf = Buffer.concat([session.recvBuf, data]);
  flushFrames(session);
}

function markClosed(session: WsSession): void {
  if (session.closed) return;
  session.closed = true;
  try { session.onClose?.(); } catch { /* ignore */ }
}

// ── Incoming frame parser ─────────────────────────────────────────
// Server → client frames are NOT masked (RFC 6455 §5.1).

interface ParseResult {
  opcode:     number;
  fin:        boolean;
  masked:     boolean;
  payload:    Buffer;
  consumed:   number;
  detail:     FrameDetail;
}

function tryParseFrame(buf: Buffer): ParseResult | null {
  if (buf.length < 2) return null;

  const b0 = buf[0];
  const b1 = buf[1];

  const fin     = (b0 & 0x80) !== 0;
  const rsv     = (b0 & 0x70) >> 4;   // bits 6–4: RSV1=bit2, RSV2=bit1, RSV3=bit0
  const opcode  = b0 & 0x0f;
  const masked  = (b1 & 0x80) !== 0;
  let   payLen  = b1 & 0x7f;
  let   offset  = 2;

  if (payLen === 126) {
    if (buf.length < 4) return null;
    payLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payLen === 127) {
    if (buf.length < 10) return null;
    // Upper 32 bits ignored (messages > 4 GB not expected in this demo)
    payLen = buf.readUInt32BE(6);
    offset = 10;
  }

  let maskKey: Buffer | undefined;
  if (masked) {
    if (buf.length < offset + 4) return null;
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buf.length < offset + payLen) return null;

  let payload = buf.subarray(offset, offset + payLen);
  if (masked && maskKey) {
    const decoded = Buffer.alloc(payLen);
    for (let i = 0; i < payLen; i++) decoded[i] = payload[i] ^ maskKey[i % 4];
    payload = decoded;
  }

  const totalBytes = offset + payLen;
  const rawHex = toHexGroups(buf.subarray(0, Math.min(totalBytes, 64)));

  return {
    opcode,
    fin,
    masked,
    payload,
    consumed: totalBytes,
    detail: {
      opcode,
      opcodeLabel: opcodeLabel(opcode),
      fin,
      rsv,
      masked,
      payloadLen:  payLen,
      maskingKey:  maskKey ? toHexGroups(maskKey) : undefined,
      rawHex,
    },
  };
}

function flushFrames(session: WsSession): void {
  while (true) {
    const f = tryParseFrame(session.recvBuf);
    if (!f) break;
    session.recvBuf = session.recvBuf.subarray(f.consumed);

    // RFC 6455 §5.2 — RSV bits MUST be 0 unless an extension defined their use.
    // We never negotiate extensions, so any non-zero RSV is a protocol error.
    if (f.detail.rsv !== 0) {
      const rsvBits = [
        f.detail.rsv & 0x4 ? "RSV1" : null,
        f.detail.rsv & 0x2 ? "RSV2" : null,
        f.detail.rsv & 0x1 ? "RSV3" : null,
      ].filter(Boolean).join(", ");
      const errMsg: WsMessage = {
        id:        crypto.randomUUID(),
        direction: "received",
        timestamp: Date.now(),
        text:      `Protocol error: ${rsvBits} bit(s) set with no extension negotiated (RFC 6455 §5.2). ` +
                   `This often means the server enabled permessage-deflate compression, which we did not request. ` +
                   `Connection closed.`,
        frame:     f.detail,
      };
      if (session.onMessage) session.onMessage(errMsg);
      else session.queue.push(errMsg);
      // Send close frame (1002 = protocol error) then tear down
      try {
        const mk      = crypto.randomBytes(4);
        const payload = Buffer.from([0x03, 0xea]);  // status 1002
        const masked  = Buffer.from([payload[0] ^ mk[0], payload[1] ^ mk[1]]);
        session.socket.write(Buffer.concat([Buffer.from([0x88, 0x82]), mk, masked]));
      } catch { /* socket may already be closing */ }
      markClosed(session);
      break;
    }

    if (f.opcode === 0x08) {
      // Close frame from server
      markClosed(session);
      break;
    }

    if (f.opcode === 0x01 || f.opcode === 0x02) {
      const msg: WsMessage = {
        id:        crypto.randomUUID(),
        direction: "received",
        timestamp: Date.now(),
        text:      f.payload.toString("utf8"),
        frame:     f.detail,
      };
      if (session.onMessage) session.onMessage(msg);
      else session.queue.push(msg);
    }

    if (f.opcode === 0x09) {
      // RFC 6455 §5.5.3 — MUST respond to every ping with a pong containing
      // the same application data. The pong must be masked (client→server).
      const { frame: pongFrame, detail: pongDetail } = encodePongFrame(f.payload);
      try { session.socket.write(pongFrame); } catch { /* socket may be closing */ }

      // Show both sides in the UI so learners see the full exchange
      const pingMsg: WsMessage = {
        id:        crypto.randomUUID(),
        direction: "received",
        timestamp: Date.now(),
        text:      f.payload.toString("utf8"),
        frame:     f.detail,
      };
      const pongMsg: WsMessage = {
        id:        crypto.randomUUID(),
        direction: "sent",
        timestamp: Date.now() + 1,
        text:      f.payload.toString("utf8"),
        frame:     pongDetail,
      };
      for (const msg of [pingMsg, pongMsg]) {
        if (session.onMessage) session.onMessage(msg);
        else session.queue.push(msg);
      }
    }
    // pong (0x0a) and continuation (0x00): not handled in this demo
  }
}

// ── Client → server frame encoding (always masked per RFC 6455 §5.3) ─

export function encodeTextFrame(text: string): {
  frame:   Buffer;
  detail:  FrameDetail;
} {
  const payload    = Buffer.from(text, "utf8");
  const maskingKey = crypto.randomBytes(4);
  const payLen     = payload.length;

  let header: Buffer;
  if (payLen <= 125) {
    header = Buffer.from([0x80 | 0x01, 0x80 | payLen]);
  } else if (payLen <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | 0x01;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payLen, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | 0x01;
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(payLen, 6);
  }

  const maskedPayload = Buffer.alloc(payLen);
  for (let i = 0; i < payLen; i++) maskedPayload[i] = payload[i] ^ maskingKey[i % 4];

  const frame = Buffer.concat([header, maskingKey, maskedPayload]);

  return {
    frame,
    detail: {
      opcode:      0x01,
      opcodeLabel: "text",
      fin:         true,
      rsv:         0,
      masked:      true,
      payloadLen:  payLen,
      maskingKey:  toHexGroups(maskingKey),
      rawHex:      toHexGroups(frame.subarray(0, Math.min(frame.length, 64))),
    },
  };
}

/** Pong frame, masked (client→server). Payload must mirror the ping's payload (RFC 6455 §5.5.3). */
export function encodePongFrame(payload: Buffer): { frame: Buffer; detail: FrameDetail } {
  // Control frames must not exceed 125 bytes (RFC 6455 §5.5)
  const p   = payload.subarray(0, 125);
  const mk  = crypto.randomBytes(4);
  const len = p.length;
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = p[i] ^ mk[i % 4];
  const frame = Buffer.concat([Buffer.from([0x80 | 0x0a, 0x80 | len]), mk, masked]);
  return {
    frame,
    detail: {
      opcode:      0x0a,
      opcodeLabel: "pong",
      fin:         true,
      rsv:         0,
      masked:      true,
      payloadLen:  len,
      maskingKey:  toHexGroups(mk),
      rawHex:      toHexGroups(frame.subarray(0, Math.min(frame.length, 64))),
    },
  };
}

/** Close frame with code 1000 (normal), masked (client-side). */
export function encodeCloseFrame(): Buffer {
  const mk      = crypto.randomBytes(4);
  const payload = Buffer.from([0x03, 0xe8]);  // status code 1000
  const masked  = Buffer.from([payload[0] ^ mk[0], payload[1] ^ mk[1]]);
  return Buffer.concat([Buffer.from([0x88, 0x82]), mk, masked]);
}

// ── Virtual-mode echo handler ─────────────────────────────────────
// Installed on the SERVER socket after the HTTP upgrade completes.
// Parses incoming masked frames (from the client) and echoes them back unmasked.

export function attachEchoHandler(serverSocket: net.Socket): void {
  let buf = Buffer.alloc(0);

  serverSocket.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const f = tryParseFrame(buf);
      if (!f) break;
      buf = buf.subarray(f.consumed);

      if (f.opcode === 0x01 || f.opcode === 0x02) {
        serverSocket.write(buildServerFrame(f.opcode, f.payload));
      } else if (f.opcode === 0x08) {
        // Echo close and hang up
        serverSocket.write(buildServerFrame(0x08, f.payload.subarray(0, 2)));
        serverSocket.end();
        break;
      } else if (f.opcode === 0x09) {
        // Respond to client pings with a pong (RFC 6455 §5.5.3)
        serverSocket.write(buildServerFrame(0x0a, f.payload));
      }
      // pong (0x0a) from client: no response needed
    }
  });
}

/** Build an unmasked server → client frame. */
function buildServerFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  if (len <= 125) {
    return Buffer.concat([Buffer.from([0x80 | opcode, len]), payload]);
  } else if (len <= 65535) {
    const h = Buffer.alloc(4);
    h[0] = 0x80 | opcode;
    h[1] = 126;
    h.writeUInt16BE(len, 2);
    return Buffer.concat([h, payload]);
  } else {
    const h = Buffer.alloc(10);
    h[0] = 0x80 | opcode;
    h[1] = 127;
    h.writeUInt32BE(0, 2);
    h.writeUInt32BE(len, 6);
    return Buffer.concat([h, payload]);
  }
}

// ── Utility ────────────────────────────────────────────────────────

function toHexGroups(buf: Buffer): string {
  return buf.toString("hex").match(/.{2}/g)?.join(" ") ?? "";
}
