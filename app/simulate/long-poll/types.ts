// ── Long Polling Types ──────────────────────────────────────────

export type LongPollMode   = "virtual" | "real";
export type LongPollPhase  = "connect" | "hold" | "respond";
export type LongPollPhaseStatus = "idle" | "active" | "done" | "error";

// Three possible outcomes per round
export type LongPollRoundStatus = "data" | "timeout" | "error";

export interface LongPollPhaseResult {
  phase:      LongPollPhase;
  status:     LongPollPhaseStatus;
  durationMs: number;
}

export interface LongPollRound {
  index:            number;
  phases:           LongPollPhaseResult[];
  status:           LongPollRoundStatus;
  holdMs:           number;    // how long the server held before responding
  totalMs:          number;
  startedAt:        number;    // epoch ms
  responseBody?:    string;
  responseHeaders?: Record<string, string>;
  httpStatus?:      number;
  httpStatusText?:  string;
}

export interface LongPollSession {
  id:             string;
  startedAt:      number;
  endedAt:        number;
  mode:           LongPollMode;
  timeoutMs:      number;
  totalRounds:    number;
  dataRounds:     number;
  timeoutRounds:  number;
  url?:           string;
}
