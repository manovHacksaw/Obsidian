// ── Types ──────────────────────────────────────────────────────

export type AppMode = "virtual" | "real" | "polling";
export type ProtocolMode = "http" | "polling" | "long-poll" | "websocket" | "heartbeat";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type StageId = "dns" | "tcp" | "tls" | "request" | "processing" | "response";
export type StageStatus = "idle" | "active" | "done" | "error" | "skipped";
export type SimMode = "auto" | "step";
export type ViewMode = "visual" | "raw";

export interface Route {
  id: string;
  method: HttpMethod;
  path: string;
  status: number;
  responseBody: string;
  delay: number;
  description?: string;
}

export interface StageResult {
  id: StageId;
  status: StageStatus;
  duration: number;
}

// What the /api/simulate endpoint returns
export interface RealResult {
  dns:      { ip: string; hostname: string; duration: number };
  tcp:      { duration: number };
  tls?:     { version: string; cipher: string; cert: { subject: string; issuer: string; validFrom: string; validTo: string; fingerprint: string }; duration: number };
  request:  { raw: string; duration: number };
  ttfb:     { duration: number };
  download: { bytes: number; duration: number };
  response: { status: number; statusText: string; headers: Record<string, string>; body: string };
  total:    number;
  error?:   string;
}

export interface ResponseState {
  status: number;
  headers: Record<string, string>;
  body: string;
  totalTime: number;
  matchedRoute?: string;
}

export type PollMode = "virtual" | "real";

export interface PollRound {
  index: number;
  stages: StageResult[];
  status: 200 | 304;
  duration: number;
  startedAt: number;
  responseBody?: string;
  // Real mode extras
  responseHeaders?: Record<string, string>;
  httpStatus?: number;
  httpStatusText?: string;
}

export interface PollSession {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: PollMode;
  intervalMs: number;
  totalRounds: number;
  dataRounds: number;
  url?: string;
}
