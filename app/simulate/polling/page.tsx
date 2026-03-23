"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import type {
  HttpMethod,
  StageId,
  StageStatus,
  StageResult,
  PollRound,
  PollMode,
  PollSession,
  ResponseState,
} from "../http/types";

import {
  POLL_STAGE_BASE_MS,
  DEFAULT_POLL_EVENTS,
  POLLING_REAL_PRESETS,
  METHOD_COLORS,
  wait,
  uid,
} from "../http/constants";

import { PollingPanel } from "../http/components/PollingPanel";
import { PollingAnalysis } from "../http/components/PollingAnalysis";
import { ResponsePanel } from "../http/components/ResponsePanel";

// ── Helpers ────────────────────────────────────────────────────────────────

function jitter(base: number) {
  return Math.max(5, base + Math.floor(Math.random() * 12) - 6);
}

// ── Protocol progression items ─────────────────────────────────────────────

const PROTOCOL_ITEMS = [
  { id: "http",      label: "HTTP",      href: "/simulate/http",      available: true  },
  { id: "polling",   label: "Polling",   href: "/simulate/polling",   available: true  },
  { id: "long-poll", label: "Long Poll", href: "/simulate/long-poll", available: true  },
  { id: "sse",       label: "SSE",       href: "/simulate/sse",       available: true  },
  { id: "websocket", label: "WebSocket", href: "#",                   available: false },
];

// ── Top Bar ────────────────────────────────────────────────────────────────

function TopBar({ pollMode }: { pollMode: PollMode }) {
  const router = useRouter();
  const [visited, setVisited] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(["polling"]);
    try {
      const stored = localStorage.getItem("obsidian_visited_modes");
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set(["polling"]);
    } catch {
      return new Set(["polling"]);
    }
  });

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has("polling")) return prev;
      const next = new Set([...prev, "polling"]);
      try {
        localStorage.setItem("obsidian_visited_modes", JSON.stringify([...next]));
      } catch { /* no-op */ }
      return next;
    });
  }, []);

  return (
    <header className="grid grid-cols-3 items-center px-6 py-3 border-b border-white/5 bg-[#0e0e0e]/90 backdrop-blur-xl shrink-0 z-10">

      {/* ── Left: identity ── */}
      <div className="flex items-center gap-4">
        <Link
          href="/simulate"
          className="flex items-center gap-1.5 text-[#adaaaa] hover:text-white transition-colors text-sm font-body"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back
        </Link>
        <span className="text-[#494847]">/</span>
        <span className="text-[#ff8f6f] font-headline font-bold text-sm uppercase tracking-widest">
          Polling
        </span>
      </div>

      {/* ── Center: progression trail ── */}
      <div className="flex items-center justify-center gap-0">
        {PROTOCOL_ITEMS.map((item, i) => {
          const isCurrent = item.id === "polling";
          const isVisited = visited.has(item.id);
          const isClickable = item.available;

          return (
            <React.Fragment key={item.id}>
              {i > 0 && (
                <div className={`w-6 h-px shrink-0 ${
                  isVisited || PROTOCOL_ITEMS[i - 1].id === "polling"
                    ? "bg-[#ff8f6f]/25"
                    : "bg-white/[0.06]"
                }`} />
              )}
              <button
                onClick={() => { if (isClickable && item.href !== "#") router.push(item.href); }}
                disabled={!isClickable}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-sm transition-all duration-200 ${
                  isClickable ? "cursor-pointer hover:opacity-100" : "cursor-default"
                }`}
              >
                <span className={`relative flex items-center justify-center w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200 ${
                  isCurrent
                    ? "bg-[#ff8f6f]"
                    : isVisited
                      ? "bg-[#ff8f6f]/40"
                      : "border border-white/20 bg-transparent"
                }`}>
                  {isCurrent && (
                    <span className="absolute inset-0 rounded-full bg-[#ff8f6f] animate-ping opacity-40" />
                  )}
                </span>
                <span className={`text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-colors duration-200 ${
                  isCurrent
                    ? "text-[#ff8f6f]"
                    : isVisited
                      ? "text-[#adaaaa]"
                      : "text-white/20"
                }`}>
                  {item.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Right: status ── */}
      <div className="flex items-center gap-4 justify-end">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              pollMode === "real" ? "bg-[#ff8f6f]" : "bg-blue-400"
            }`}
            style={
              pollMode === "real"
                ? { boxShadow: "0 0 6px rgba(255,143,111,0.5)" }
                : { boxShadow: "0 0 6px rgba(96,165,250,0.5)" }
            }
          />
          <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#777575]">
            {pollMode === "real" ? "Real Network" : "Simulated"}
          </span>
        </div>
      </div>
    </header>
  );
}

// ── Left Panel ─────────────────────────────────────────────────────────────

function LeftPanel({
  pollMode,
  pollEvents,
  firedEventIds,
  pollSessions,
  onSetPollMode,
  onSelectPollTarget,
}: {
  pollMode: PollMode;
  pollEvents: typeof DEFAULT_POLL_EVENTS;
  firedEventIds: string[];
  pollSessions: PollSession[];
  onSetPollMode: (m: PollMode) => void;
  onSelectPollTarget: (url: string, method: HttpMethod) => void;
}) {
  return (
    <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden">

      {/* Mode toggle */}
      <div className="flex border-b border-white/5 shrink-0">
        {(["virtual", "real"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onSetPollMode(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-bold font-body uppercase tracking-widest transition-colors ${
              pollMode === m
                ? "text-[#ff8f6f] border-b-2 border-[#ff8f6f] -mb-px"
                : "text-[#494847] hover:text-[#adaaaa]"
            }`}
          >
            <span className="material-symbols-outlined text-xs">
              {m === "virtual" ? "dns" : "travel_explore"}
            </span>
            {m}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">

        {pollMode === "real" ? (
          <div className="p-4 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">
                Quick Targets
              </span>
              <div className="space-y-1">
                {POLLING_REAL_PRESETS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => onSelectPollTarget(p.url, p.method)}
                    className="w-full text-left px-3 py-2 rounded-sm transition-colors border bg-[#1a1919] border-transparent hover:bg-[#201f1f] text-[#adaaaa] hover:text-white"
                  >
                    <div className="text-[10px] font-bold font-body">{p.label}</div>
                    <div className="text-[9px] font-mono text-[#494847] truncate mt-0.5">{p.url}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/5" />
            <WhyCostly />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#494847]">
                Server Event Queue
              </span>
              <span className="text-[9px] font-body text-[#2e2e2e]">
                {firedEventIds.length}/{pollEvents.length} fired
              </span>
            </div>
            <div className="px-2 pb-2 pt-2 space-y-1.5">
              {pollEvents.map((evt) => {
                const fired = firedEventIds.includes(evt.id);
                const bodyPreview = evt.body.replace(/\s+/g, " ").trim().slice(0, 55);
                return (
                  <div
                    key={evt.id}
                    className={`p-3 rounded-sm border transition-all duration-300 ${
                      fired
                        ? "bg-[#ff8f6f]/5 border-[#ff8f6f]/15"
                        : "bg-[#111] border-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                        fired ? "bg-[#ff8f6f]" : "bg-[#252525]"
                      }`} />
                      <span className={`text-[9px] font-mono tabular-nums ${
                        fired ? "text-[#ff8f6f]/60" : "text-[#333]"
                      }`}>
                        +{evt.delayMs / 1000}s
                      </span>
                      <span className={`text-[9px] font-body ${fired ? "text-[#adaaaa]" : "text-[#333]"}`}>
                        {evt.label}
                      </span>
                      {fired && (
                        <span
                          className="ml-auto material-symbols-outlined text-[#ff8f6f]/70 shrink-0"
                          style={{ fontSize: "11px" }}
                        >
                          check_circle
                        </span>
                      )}
                    </div>
                    <div className={`text-[9px] font-mono rounded-sm px-2 py-1.5 bg-[#0a0a0a] leading-relaxed ${
                      fired ? "text-[#3a3939]" : "text-[#222]"
                    }`}>
                      {bodyPreview}…
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 pb-4 pt-2 border-t border-white/5 mt-2">
              <WhyCostly />
            </div>
          </div>
        )}

        {/* History */}
        {pollSessions.length > 0 && (
          <div className="p-4 border-t border-white/5 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block">
              History
            </span>
            <div className="space-y-1">
              {pollSessions.slice().reverse().map((s) => {
                const waste = s.totalRounds > 0
                  ? Math.round(((s.totalRounds - s.dataRounds) / s.totalRounds) * 100)
                  : 0;
                return (
                  <div key={s.id} className="px-3 py-2 rounded-sm bg-[#1a1919] border border-transparent">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm ${
                        s.mode === "real"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-purple-500/15 text-purple-400"
                      }`}>{s.mode}</span>
                      <span className="text-[9px] font-body text-[#494847]">
                        {s.totalRounds} rounds · {s.intervalMs}ms
                      </span>
                      <span className="ml-auto text-[9px] font-mono text-red-400/70">{waste}% waste</span>
                    </div>
                    {s.url && (
                      <div className="text-[9px] font-mono text-[#333] truncate">{s.url}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WhyCostly() {
  return (
    <div className="space-y-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#3a3939]">
        Why it&apos;s costly
      </span>
      <div className="space-y-1.5">
        {[
          { icon: "wifi",        text: "Full TCP handshake on every poll" },
          { icon: "timer",       text: "Latency = up to 1 full interval" },
          { icon: "trending_up", text: "Server load scales with client count" },
        ].map(({ icon, text }) => (
          <div key={icon} className="flex items-start gap-2">
            <span
              className="material-symbols-outlined text-[#2e2e2e] shrink-0 mt-px"
              style={{ fontSize: "11px", lineHeight: 1.4 }}
            >
              {icon}
            </span>
            <span className="text-[9px] font-body text-[#2e2e2e] leading-relaxed">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PollingPage() {
  // ── Mode ──
  const [pollMode, setPollMode] = useState<PollMode>("virtual");

  // ── Request config ──
  const [pollUrl, setPollUrl] = useState("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
  const [pollMethod, setPollMethod] = useState<HttpMethod>("GET");

  // ── Polling state ──
  const [pollIntervalMs, setPollIntervalMs] = useState(1000);
  const [maxPollRounds, setMaxPollRounds] = useState(15);
  const [pollRounds, setPollRounds] = useState<PollRound[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [currentPollStages, setCurrentPollStages] = useState<StageResult[]>([]);
  const [pollWaiting, setPollWaiting] = useState(false);
  const [firedEventIds, setFiredEventIds] = useState<string[]>([]);
  const [currentPollRoundIdx, setCurrentPollRoundIdx] = useState(0);
  const [selectedPollRoundIdx, setSelectedPollRoundIdx] = useState<number | null>(null);
  const [pollSessions, setPollSessions] = useState<PollSession[]>([]);

  // ── Response panel state ──
  const [respTab, setRespTab] = useState<"body" | "headers" | "raw">("body");
  const [bodyPretty, setBodyPretty] = useState(true);
  const [bodyCopied, setBodyCopied] = useState(false);
  const [expandedBody, setExpandedBody] = useState(false);

  // ── Right panel drag-resize ──
  const [rightWidth, setRightWidth] = useState(256);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onMoveRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const onUpRef = useRef<(() => void) | null>(null);

  // ── Refs ──
  const isPollingRef = useRef(false);
  const firedEventIdsRef = useRef(new Set<string>());
  const pollStartRef = useRef(0);
  const pollRoundAbortRef = useRef<AbortController | null>(null);
  // Virtual ETag tracking — mirrors how real conditional requests work:
  // server assigns an ETag to its current state; client echoes it as
  // If-None-Match; server returns 304 (no body) when state is unchanged.
  const currentEtagRef = useRef<string>("etag-v0");
  const firedCountRef  = useRef(0);

  // ── Drag cleanup ──
  const cleanupDragHandlers = useCallback(() => {
    if (onMoveRef.current) { window.removeEventListener("mousemove", onMoveRef.current); onMoveRef.current = null; }
    if (onUpRef.current) { window.removeEventListener("mouseup", onUpRef.current); onUpRef.current = null; }
    dragRef.current = null;
  }, []);

  useEffect(() => cleanupDragHandlers, [cleanupDragHandlers]);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    cleanupDragHandlers();
    dragRef.current = { startX: e.clientX, startW: rightWidth };
    onMoveRef.current = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setRightWidth(Math.min(640, Math.max(200, dragRef.current.startW + delta)));
    };
    onUpRef.current = () => cleanupDragHandlers();
    window.addEventListener("mousemove", onMoveRef.current);
    window.addEventListener("mouseup", onUpRef.current);
  };

  // ── Reset ──
  const resetPolling = () => {
    isPollingRef.current = false;
    pollRoundAbortRef.current?.abort();
    pollRoundAbortRef.current = null;
    setIsPolling(false);
    setPollRounds([]);
    setCurrentPollStages([]);
    setFiredEventIds([]);
    setPollWaiting(false);
    setCurrentPollRoundIdx(0);
    setSelectedPollRoundIdx(null);
    firedEventIdsRef.current = new Set();
  };

  const stopPolling = () => {
    isPollingRef.current = false;
    pollRoundAbortRef.current?.abort();
  };

  // ── Virtual polling simulation ──
  const runPolling = useCallback(async () => {
    if (isPolling) return;

    setPollRounds([]);
    setCurrentPollStages([]);
    setFiredEventIds([]);
    setPollWaiting(false);
    setCurrentPollRoundIdx(0);
    firedEventIdsRef.current = new Set();
    currentEtagRef.current   = "etag-v0";
    firedCountRef.current    = 0;

    setIsPolling(true);
    isPollingRef.current = true;
    pollStartRef.current = Date.now();

    for (let i = 0; i < maxPollRounds; i++) {
      if (!isPollingRef.current) break;
      setCurrentPollRoundIdx(i);

      const roundStart = Date.now();
      const roundStages: StageResult[] = [];

      // Animate mini stages: dns → tcp → request → response
      for (const sid of ["dns", "tcp", "request", "response"] as const) {
        if (!isPollingRef.current) break;
        const dur = jitter(POLL_STAGE_BASE_MS[sid]);
        setCurrentPollStages([...roundStages, { id: sid, status: "active", duration: 0 }]);
        await wait(dur);
        if (!isPollingRef.current) break;
        roundStages.push({ id: sid, status: "done", duration: dur });
        setCurrentPollStages([...roundStages]);
      }

      if (!isPollingRef.current) break;

      // The client sends the ETag from the previous response as If-None-Match.
      // The server checks its current state against that ETag:
      //   — if state changed (new event fired) → new ETag + 200 + body
      //   — if state unchanged                → same ETag + 304 (no body)
      const sentEtag = currentEtagRef.current;

      const elapsed = Date.now() - pollStartRef.current;
      const fired = DEFAULT_POLL_EVENTS.find(
        (e) => e.delayMs <= elapsed && !firedEventIdsRef.current.has(e.id)
      );
      if (fired) {
        firedEventIdsRef.current.add(fired.id);
        firedCountRef.current += 1;
        currentEtagRef.current = `etag-v${firedCountRef.current}`;
        setFiredEventIds((prev) => [...prev, fired.id]);
      }

      const serverEtag = currentEtagRef.current;

      const round: PollRound = {
        index:        i,
        stages:       roundStages,
        status:       fired ? 200 : 304,
        duration:     Date.now() - roundStart,
        startedAt:    roundStart,
        responseBody: fired?.body,
        // ETag headers — the mechanism that makes 304 correct.
        requestEtag:  i > 0 ? sentEtag : undefined,   // first request has no If-None-Match
        etag:         serverEtag,
      };

      setPollRounds((prev) => [...prev, round]);
      setCurrentPollStages([]);

      if (!isPollingRef.current) break;

      // Wait remaining interval in 100ms chunks so stop is responsive
      const remaining = pollIntervalMs - (Date.now() - roundStart);
      if (remaining > 0) {
        setPollWaiting(true);
        let waited = 0;
        while (waited < remaining && isPollingRef.current) {
          const chunk = Math.min(100, remaining - waited);
          await wait(chunk);
          waited += chunk;
        }
        setPollWaiting(false);
      }
    }

    isPollingRef.current = false;
    setIsPolling(false);
    setCurrentPollStages([]);
    setPollWaiting(false);
  }, [isPolling, maxPollRounds, pollIntervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real polling simulation ──
  const runRealPolling = useCallback(async () => {
    if (isPolling) return;

    setPollRounds([]);
    setCurrentPollStages([]);
    setFiredEventIds([]);
    setPollWaiting(false);
    setCurrentPollRoundIdx(0);
    setSelectedPollRoundIdx(null);
    firedEventIdsRef.current = new Set();

    setIsPolling(true);
    isPollingRef.current = true;
    pollStartRef.current = Date.now();

    const STAGE_IDS: StageId[] = ["dns", "tcp", "tls", "request", "processing", "response"];
    let lastBody: string | null = null;
    const completedRounds: PollRound[] = [];

    for (let i = 0; i < maxPollRounds; i++) {
      if (!isPollingRef.current) break;
      setCurrentPollRoundIdx(i);
      setCurrentPollStages([]);

      const roundStart = Date.now();
      const roundStages: StageResult[] = [];
      const acc: Record<string, { duration: number; data?: Record<string, unknown> }> = {};

      const roundAbort = new AbortController();
      pollRoundAbortRef.current = roundAbort;

      let res: Response;
      try {
        res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: pollMethod, url: pollUrl }),
          signal: roundAbort.signal,
        });
      } catch (e) {
        if (!isPollingRef.current) break;
        continue; // network error on this round — keep going
      }

      if (!res.body || !isPollingRef.current) break;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        outer: while (true) {
          if (!isPollingRef.current) { reader.cancel(); break; }
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let evt: Record<string, unknown>;
            try { evt = JSON.parse(line.slice(6)); } catch { continue; }

            if (evt.type === "stage") {
              const id       = evt.id as StageId;
              const status   = evt.status as StageStatus;
              const duration = evt.duration as number;
              const data     = evt.data as Record<string, unknown> | undefined;
              acc[id] = { duration, data };
              const existing = roundStages.findIndex((s) => s.id === id);
              const entry: StageResult = { id, status, duration };
              if (existing >= 0) roundStages[existing] = entry;
              else roundStages.push(entry);
              setCurrentPollStages([...roundStages]);
            } else if (evt.type === "error" || evt.type === "complete") {
              break outer;
            }
          }
        }
      } catch { /* cancelled */ }

      if (!isPollingRef.current) break;

      const respAcc = acc["response"]?.data as {
        status: number; statusText: string;
        headers: Record<string, string>; body: string;
      } | undefined;

      const currentBody = respAcc?.body ?? null;
      const dataChanged = currentBody !== null && currentBody !== lastBody;
      if (dataChanged) lastBody = currentBody;

      // Use the actual HTTP status the server sent.
      // Most APIs always return 200 even for unchanged data — that is correct
      // HTTP behaviour. Only servers that implement conditional requests
      // (ETag + If-None-Match) will ever return a real 304.
      // We track body freshness separately via `dataChanged` for the analysis.
      const actualStatus = (respAcc?.status ?? 200) as 200 | 304;

      // Ensure all stage IDs are present
      for (const sid of STAGE_IDS) {
        if (!roundStages.find((s) => s.id === sid)) {
          roundStages.push({ id: sid, status: "skipped", duration: 0 });
        }
      }

      const round: PollRound = {
        index:           i,
        stages:          roundStages,
        status:          actualStatus,
        dataChanged,
        duration:        Date.now() - roundStart,
        startedAt:       roundStart,
        responseBody:    currentBody ?? undefined,
        responseHeaders: respAcc?.headers,
        httpStatus:      respAcc?.status,
        httpStatusText:  respAcc?.statusText,
      };

      completedRounds.push(round);
      setPollRounds((prev) => [...prev, round]);
      setCurrentPollStages([]);

      if (!isPollingRef.current) break;

      const remaining = pollIntervalMs - (Date.now() - roundStart);
      if (remaining > 0) {
        setPollWaiting(true);
        let waited = 0;
        while (waited < remaining && isPollingRef.current) {
          const chunk = Math.min(100, remaining - waited);
          await wait(chunk);
          waited += chunk;
        }
        setPollWaiting(false);
      }
    }

    // Save to session history.
    // In real mode, most APIs always return 200 — we count a round as "data"
    // only when the body actually differed from the previous round.
    const dataRounds = completedRounds.filter((r) =>
      pollMode === "real" ? r.dataChanged === true : r.status === 200
    ).length;
    if (completedRounds.length > 0) {
      setPollSessions((prev) => [
        {
          id: uid(),
          startedAt: pollStartRef.current,
          endedAt: Date.now(),
          mode: "real",
          intervalMs: pollIntervalMs,
          totalRounds: completedRounds.length,
          dataRounds,
          url: pollUrl,
        },
        ...prev.slice(0, 9),
      ]);
    }

    isPollingRef.current = false;
    pollRoundAbortRef.current = null;
    setIsPolling(false);
    setCurrentPollStages([]);
    setPollWaiting(false);
  }, [isPolling, maxPollRounds, pollIntervalMs, pollUrl, pollMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derive selected round response for ResponsePanel ──
  const selectedPollResponse: ResponseState | null = (() => {
    if (selectedPollRoundIdx === null) return null;
    const round = pollRounds[selectedPollRoundIdx];
    if (!round) return null;

    // Virtual 304: show the ETag/If-None-Match exchange so users understand
    // the mechanism — the server decided to send 304, not the client.
    if (pollMode === "virtual" && round.status === 304) {
      const headers: Record<string, string> = {
        "etag": round.etag ?? "",
      };
      if (round.requestEtag) headers["x-if-none-match-sent"] = round.requestEtag;
      return {
        status: 304,
        headers,
        body: "// 304 Not Modified\n// Server ETag matches If-None-Match → no body sent\n//\n// Request sent:  If-None-Match: " + (round.requestEtag ?? "(none — first request)") + "\n// Server ETag:   " + (round.etag ?? "") + "\n// Conclusion:    State unchanged → skip body, save bandwidth",
        totalTime: round.duration,
      };
    }

    // Virtual 200: include the new ETag in response headers
    if (pollMode === "virtual" && round.status === 200) {
      return {
        status: 200,
        headers: { "content-type": "application/json", ...(round.etag ? { "etag": round.etag } : {}) },
        body: round.responseBody ?? "",
        totalTime: round.duration,
      };
    }

    // Real mode: show actual server status and response
    return {
      status: round.httpStatus ?? 200,
      headers: round.responseHeaders ?? { "content-type": "application/json" },
      body: round.responseBody ?? "",
      totalTime: round.duration,
    };
  })();

  // ── Show analysis panel: only after all rounds done, no round selected ──
  const showAnalysis = !isPolling && pollRounds.length > 0 && selectedPollRoundIdx === null;
  // ── Show response panel: when a round is selected ──
  const showResponse = selectedPollRoundIdx !== null;

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      <TopBar pollMode={pollMode} />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <LeftPanel
          pollMode={pollMode}
          pollEvents={DEFAULT_POLL_EVENTS}
          firedEventIds={firedEventIds}
          pollSessions={pollSessions}
          onSetPollMode={setPollMode}
          onSelectPollTarget={(url, method) => { setPollUrl(url); setPollMethod(method); }}
        />

        {/* ── Center: PollingPanel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <PollingPanel
            pollMode={pollMode}
            pollUrl={pollUrl}
            pollMethod={pollMethod}
            pollRounds={pollRounds}
            currentPollStages={currentPollStages}
            currentRoundIdx={currentPollRoundIdx}
            isPolling={isPolling}
            pollWaiting={pollWaiting}
            pollIntervalMs={pollIntervalMs}
            maxPollRounds={maxPollRounds}
            selectedRoundIdx={selectedPollRoundIdx}
            onSetPollUrl={setPollUrl}
            onSetPollMethod={setPollMethod}
            onSetInterval={setPollIntervalMs}
            onSetMaxRounds={setMaxPollRounds}
            onStart={pollMode === "real" ? runRealPolling : runPolling}
            onStop={stopPolling}
            onReset={resetPolling}
            onSelectRound={setSelectedPollRoundIdx}
          />
        </div>

        {/* ── Right: Analysis or Response ── */}
        <AnimatePresence mode="wait">
          {showAnalysis && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="contents"
            >
              <PollingAnalysis
                rounds={pollRounds}
                intervalMs={pollIntervalMs}
                mode={pollMode}
                pollUrl={pollMode === "real" ? pollUrl : undefined}
                rightWidth={rightWidth}
                onDragHandleMouseDown={handleDragMouseDown}
              />
            </motion.div>
          )}
          {showResponse && (
            <motion.div
              key="response"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="contents"
            >
              <ResponsePanel
                appMode="virtual"
                method={pollMethod}
                virtualUrl={pollUrl || "polling"}
                isDone={true}
                isRunning={false}
                simError={null}
                response={selectedPollResponse}
                realResult={null}
                respTab={respTab}
                bodyPretty={bodyPretty}
                bodyCopied={bodyCopied}
                rightWidth={rightWidth}
                expandedBody={expandedBody}
                onSetRespTab={setRespTab}
                onSetBodyPretty={setBodyPretty}
                onSetBodyCopied={setBodyCopied}
                onSetExpandedBody={setExpandedBody}
                onShowLifecycle={() => {}}
                onDragHandleMouseDown={handleDragMouseDown}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
