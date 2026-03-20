import type { LongPollRoundStatus } from "./types";

// ── Phase color tokens ──────────────────────────────────────────
// connect = blue  (same family as HTTP DNS/TCP)
// hold    = amber (unique to long-poll — the server waiting phase)
// respond = green (same as HTTP response)

export const LP_PHASE_BAR_COLORS: Record<string, string> = {
  connect: "bg-blue-500",
  hold:    "bg-amber-500",
  respond: "bg-green-500",
};

export const LP_PHASE_TEXT_COLORS: Record<string, string> = {
  connect: "text-blue-400",
  hold:    "text-amber-400",
  respond: "text-green-400",
};

export const LP_PHASE_BG_ACTIVE: Record<string, string> = {
  connect: "bg-blue-500/5",
  hold:    "bg-amber-500/5",
  respond: "bg-green-500/5",
};

// ── Round status display ────────────────────────────────────────

export const LP_STATUS_DISPLAY: Record<
  LongPollRoundStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  data:    { label: "DATA",    color: "text-green-400",  bg: "bg-green-500/15",  border: "border-green-500/25" },
  timeout: { label: "WAIT",    color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20" },
  error:   { label: "ERROR",   color: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/25"   },
};

// ── Timeout presets ─────────────────────────────────────────────
// Shorter than real-world 20-30s for demo purposes

export const LP_TIMEOUT_PRESETS_MS = [3000, 5000, 8000, 15000];
export const DEFAULT_LP_TIMEOUT_MS = 5000;

// ── Max rounds presets ──────────────────────────────────────────

export const LP_MAX_ROUND_PRESETS = [5, 10, 20, 30];
export const DEFAULT_LP_MAX_ROUNDS = 10;

// ── Base durations for virtual phase animation ──────────────────

export const LP_PHASE_BASE_MS = {
  connect: 35,
  respond: 20,
} as const;

// ── Virtual event queue ─────────────────────────────────────────
// Delays are longer than short-polling defaults to demonstrate that
// long-polling generates far fewer round-trips for the same events.

export interface LongPollEvent {
  id:      string;
  delayMs: number;
  label:   string;
  body:    string;
}

export const DEFAULT_LP_EVENTS: LongPollEvent[] = [
  {
    id: "lpe1",
    delayMs: 6000,
    label: "Order filled",
    body: '{\n  "type": "order_filled",\n  "orderId": "ORD-9821",\n  "symbol": "BTC-USD",\n  "price": 67520,\n  "qty": 0.25,\n  "ts": 1700000006\n}',
  },
  {
    id: "lpe2",
    delayMs: 14000,
    label: "New message",
    body: '{\n  "type": "message",\n  "from": "carol",\n  "text": "Long polling works great for chat!",\n  "ts": 1700000014\n}',
  },
  {
    id: "lpe3",
    delayMs: 22000,
    label: "Alert fired",
    body: '{\n  "type": "alert",\n  "severity": "high",\n  "message": "CPU usage above 90%",\n  "ts": 1700000022\n}',
  },
];

// ── Real-mode presets ───────────────────────────────────────────
// httpbin.org/delay/{n} holds the connection for n seconds — the
// closest public stand-in for a real long-poll endpoint.

export const LP_REAL_PRESETS = [
  { label: "httpbin delay/2",  url: "https://httpbin.org/delay/2" },
  { label: "httpbin delay/4",  url: "https://httpbin.org/delay/4" },
  { label: "httpbin delay/7",  url: "https://httpbin.org/delay/7" },
  { label: "Localhost :3000",  url: "http://localhost:3000" },
  { label: "Localhost :3001",  url: "http://localhost:3001" },
];

// ── Utilities ───────────────────────────────────────────────────

export function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
export function uid()            { return Math.random().toString(36).slice(2, 10); }
export function jitter(base: number) { return Math.max(5, base + Math.floor(Math.random() * 14) - 7); }
