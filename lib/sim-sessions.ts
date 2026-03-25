import * as net from "node:net";
import * as tls from "node:tls";

// ── Types ──────────────────────────────────────────────────────

export interface CertInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

export interface SimSession {
  id: string;
  createdAt: number;
  // Connection state
  ip?: string;
  hostname?: string;
  port?: number;
  isHttps?: boolean;
  rawSocket?: net.Socket;
  socket?: net.Socket | tls.TLSSocket; // active socket (tls or raw)
  // TLS info
  tlsVersion?: string;
  tlsCipher?: string;
  tlsCert?: CertInfo;
  // Response buffer
  responseChunks?: Buffer[];
  firstByteAt?: number;
  responseFinished?: boolean;
  responseFinishedAt?: number;
  requestSentAt?: number;
  requestRaw?: string;
  // Expiry timer
  _timer: ReturnType<typeof setTimeout>;
  // Called immediately when the first response byte arrives (replaces polling)
  _firstByteResolve?: () => void;
}

// ── Global session store ────────────────────────────────────────
// Stored on globalThis to survive Next.js hot-reload in dev.
//
// ⚠ SINGLE-INSTANCE ONLY
// Sessions hold live TCP/TLS sockets. Sockets are OS resources tied to
// the process that opened them — they cannot be serialized, shared via
// Redis, or handed off to another process. In a multi-instance
// deployment (e.g., Vercel serverless, horizontally scaled containers)
// a step request routed to a different instance than the one that
// created the session will fail with "session not found".
//
// This is an inherent constraint of step-mode: persistent connection
// state requires a persistent process. Use `next dev` / `vercel dev`
// (single process) for reliable step-mode operation. A horizontally
// scalable design would require a WebSocket gateway or a dedicated
// connection-broker process — out of scope for this educational tool.

declare global {
  // eslint-disable-next-line no-var
  var __simSessions: Map<string, SimSession> | undefined;
  // eslint-disable-next-line no-var
  var __simSessionsWarnedVercel: boolean | undefined;
}

function getStore(): Map<string, SimSession> {
  if (!globalThis.__simSessions) {
    globalThis.__simSessions = new Map();
  }
  // Warn once per process when running on a known multi-instance platform
  if (process.env.VERCEL && !globalThis.__simSessionsWarnedVercel) {
    globalThis.__simSessionsWarnedVercel = true;
    console.warn(
      "[sim-sessions] Vercel detected. Step-mode sessions are stored in process memory " +
      "and will not survive routing to a different serverless instance. " +
      "Use a single-instance deployment for reliable step-mode operation."
    );
  }
  return globalThis.__simSessions;
}

const SESSION_TTL_MS = 60_000; // 60 seconds

function destroySession(id: string): void {
  const store = getStore();
  const s = store.get(id);
  if (!s) return;
  clearTimeout(s._timer);
  try { s.socket?.destroy(); } catch { /* no-op */ }
  try { if (s.rawSocket && s.rawSocket !== s.socket) s.rawSocket.destroy(); } catch { /* no-op */ }
  store.delete(id);
}

function createSession(id: string): SimSession {
  const store = getStore();
  // If an old session with same id exists, clean it up first
  if (store.has(id)) destroySession(id);

  const timer = setTimeout(() => destroySession(id), SESSION_TTL_MS);
  const session: SimSession = { id, createdAt: Date.now(), _timer: timer };
  store.set(id, session);
  return session;
}

function getSession(id: string): SimSession | undefined {
  return getStore().get(id);
}

/** Reset the 60s expiry clock whenever there is activity. */
function touchSession(id: string): void {
  const store = getStore();
  const s = store.get(id);
  if (!s) return;
  clearTimeout(s._timer);
  s._timer = setTimeout(() => destroySession(id), SESSION_TTL_MS);
}

export { createSession, getSession, destroySession, touchSession };
