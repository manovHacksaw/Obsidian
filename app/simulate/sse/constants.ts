// ── SSE Simulator Constants ──────────────────────────────────────

// ── Virtual event definitions ────────────────────────────────────
// Live notification stream — classic SSE use case.

export interface SSEVirtualEvent {
  id:        string;
  delayMs:   number;
  eventType: string;
  label:     string;
  data:      string;
}

export const DEFAULT_SSE_EVENTS: SSEVirtualEvent[] = [
  {
    id: "sse1", delayMs: 3000, eventType: "notification", label: "New message",
    data: '{\n  "from": "alice",\n  "msg": "Hey, are you there?",\n  "ts": 1700000003\n}',
  },
  {
    id: "sse2", delayMs: 7000, eventType: "notification", label: "Like",
    data: '{\n  "from": "john",\n  "action": "liked your post",\n  "postId": "p-442"\n}',
  },
  {
    id: "sse3", delayMs: 11000, eventType: "alert", label: "Server alert",
    data: '{\n  "severity": "high",\n  "msg": "CPU at 92%",\n  "host": "web-01"\n}',
  },
  {
    id: "sse4", delayMs: 16000, eventType: "notification", label: "PR comment",
    data: '{\n  "from": "github-bot",\n  "msg": "Tests passed ✓",\n  "pr": 142\n}',
  },
  {
    id: "sse5", delayMs: 21000, eventType: "close", label: "Stream end",
    data: '{\n  "reason": "all events delivered"\n}',
  },
];

// ── Event type color tokens ───────────────────────────────────────
// notification = blue  (informational)
// alert        = amber (attention)
// close        = dim   (terminal)
// message      = green (default SSE type)

export const SSE_EVENT_TYPE_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  notification: { text: "text-blue-400",    bg: "bg-blue-500/10",  border: "border-blue-500/15"  },
  alert:        { text: "text-amber-400",   bg: "bg-amber-500/10", border: "border-amber-500/15" },
  close:        { text: "text-[#555350]",   bg: "bg-white/[0.04]", border: "border-white/[0.06]" },
  message:      { text: "text-green-400",   bg: "bg-green-500/10", border: "border-green-500/15" },
};

export function getEventTypeStyle(eventType: string) {
  return SSE_EVENT_TYPE_STYLES[eventType] ?? {
    text:   "text-[#adaaaa]",
    bg:     "bg-white/[0.05]",
    border: "border-white/[0.08]",
  };
}

// ── Real-mode presets ─────────────────────────────────────────────
// Public SSE endpoints are rare — localhost is the honest recommendation.

export const SSE_REAL_PRESETS = [
  { label: "Wikimedia page-create",    url: "https://stream.wikimedia.org/v2/stream/page-create"  },
  { label: "Wikimedia recentchange",   url: "https://stream.wikimedia.org/v2/stream/recentchange" },
  { label: "Localhost :3000/api/sse",  url: "http://localhost:3000/api/sse"                       },
  { label: "Localhost :3001/events",   url: "http://localhost:3001/events"                        },
];

// ── Request headers sent to SSE endpoints ────────────────────────
// These are the headers our proxy server sends on behalf of the client.

export const SSE_REQUEST_HEADERS: Record<string, string> = {
  "Accept":        "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection":    "keep-alive",
  "User-Agent":    "ObsidianSim/1.0",
};

// ── Virtual-mode response headers (simulated) ────────────────────
// Mirrors what route.ts actually sends back to the browser.

export const SSE_VIRTUAL_RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type":      "text/event-stream",
  "Cache-Control":     "no-cache, no-transform",
  "Connection":        "keep-alive",
  "X-Accel-Buffering": "no",
  "Transfer-Encoding": "chunked",
};

// ── Header annotations ───────────────────────────────────────────
// Explain why each header matters in an SSE context.

export interface HeaderAnnotation {
  importance: "key" | "normal" | "dim";
  note:       string;
}

export const HEADER_ANNOTATIONS: Record<string, HeaderAnnotation> = {
  "accept":            { importance: "key",    note: "Signals to the server we want a live stream, not a buffered HTTP response" },
  "cache-control":     { importance: "key",    note: "Prevents proxies and the browser from buffering the stream" },
  "content-type":      { importance: "key",    note: "text/event-stream is the contract — this tells the client to keep reading" },
  "connection":        { importance: "normal", note: "Keeps the TCP connection alive so the server can push events freely" },
  "transfer-encoding": { importance: "normal", note: "Chunked encoding lets the server send frames without a final Content-Length" },
  "x-accel-buffering": { importance: "normal", note: "Disables Nginx proxy buffering — required for real-time delivery through a reverse proxy" },
  "user-agent":        { importance: "dim",    note: "Identifies this simulator as the request origin" },
};

// ── Utilities ────────────────────────────────────────────────────

export function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
export function uid()            { return Math.random().toString(36).slice(2, 10); }
