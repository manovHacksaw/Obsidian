// ── SSE Simulator Types ─────────────────────────────────────────

export type SSEMode             = "virtual" | "real";
export type SSEConnectionStatus = "idle" | "connecting" | "streaming" | "closed" | "error";

// ── Protocol lifecycle ───────────────────────────────────────────
// "connect" = real-mode aggregate (DNS+TCP+TLS+Request all lumped)
// "dns"..."request" = virtual-mode granular steps
export type LifecycleStepId =
  | "dns" | "tcp" | "tls" | "request"  // virtual only
  | "connect"                            // real only (aggregate)
  | "headers" | "stream_open";          // both modes

export type LifecycleStepStatus = "pending" | "active" | "done" | "error";

export interface LifecycleStep {
  id:           LifecycleStepId;
  label:        string;
  status:       LifecycleStepStatus;
  durationMs?:  number;
  note?:        string;
  lastEventId?: string;   // set on "request" step during a Last-Event-ID reconnect
}

// Whether the remote endpoint behaved as a true SSE stream or a plain HTTP response.
// null = not yet determined (virtual mode is always "sse").
export type SSEResponseType = "sse" | "http" | null;

export interface SSEConnectionInfo {
  isSSE:          boolean;
  contentType:    string;
  httpStatus:     number;
  httpStatusText: string;
}

export interface SSEEvent {
  index:      number;
  id?:        string;
  eventType:  string;       // e.g. "message", "notification", "alert"
  data:       string;
  elapsedMs:  number;       // ms since connection established
  receivedAt: number;       // epoch ms
  isReplay?:  boolean;      // received after a Last-Event-ID reconnect (was already delivered before)
}

// Info emitted by the server when resuming after Last-Event-ID reconnect
export interface ReconnectResumeInfo {
  lastEventId:     string;
  skippedCount:    number;  // events the server skipped (already delivered)
  resumingFromId:  string | null;
}

export interface SSESession {
  id:            string;
  startedAt:     number;
  endedAt:       number;
  mode:          SSEMode;
  url?:          string;
  connectMs:     number;
  totalEvents:   number;
  totalMs:       number;
  avgIntervalMs: number;
}
