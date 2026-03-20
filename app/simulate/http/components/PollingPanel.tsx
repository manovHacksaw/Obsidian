"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StageResult, PollRound, PollMode, HttpMethod } from "../types";
import { METHODS, METHOD_COLORS, STAGE_BAR_COLORS } from "../constants";

// ── Mini stage bars ──────────────────────────────────────────────
// Uses same STAGE_BAR_COLORS token as the HTTP lifecycle panel

function MiniStageBars({ stages }: { stages: StageResult[] }) {
  const visible = stages.filter((s) => s.status !== "skipped");
  const totalDur = visible.reduce((s, r) => s + Math.max(r.duration, 6), 0) || 1;
  return (
    <div className="flex items-center gap-[2px]" style={{ width: "96px" }}>
      {visible.map((s) => {
        const pct   = (Math.max(s.duration, 6) / totalDur) * 100;
        const color = STAGE_BAR_COLORS[s.id as keyof typeof STAGE_BAR_COLORS] ?? "bg-white/20";
        const active = s.status === "active";
        return (
          <div
            key={s.id}
            className={`h-1.5 rounded-[1px] transition-all ${color} ${active ? "opacity-25 animate-pulse" : "opacity-60"}`}
            style={{ width: `${pct}%` }}
            title={`${s.id}: ${s.duration}ms`}
          />
        );
      })}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────

function StatusBadge({ status, selected }: { status: 200 | 304; selected: boolean }) {
  if (status === 200) {
    return (
      <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded tabular-nums ${
        selected ? "bg-green-500/25 text-green-300" : "bg-green-500/12 text-green-400"
      }`}>200</span>
    );
  }
  return (
    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded tabular-nums bg-white/[0.03] text-[#2e2e2e]">
      304
    </span>
  );
}

// ── Single round row ─────────────────────────────────────────────

function PollRoundRow({
  round,
  isSelected,
  onClick,
}: {
  round: PollRound;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isData  = round.status === 200;
  const totalMs = round.stages.filter((s) => s.status !== "skipped").reduce((s, r) => s + r.duration, 0);
  const preview = round.responseBody
    ? round.responseBody.replace(/\s+/g, " ").trim().slice(0, 56) + (round.responseBody.length > 56 ? "…" : "")
    : null;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-3 px-4 py-[7px] border-b border-white/[0.03] cursor-pointer transition-colors ${
        isSelected
          ? "bg-[#ff8f6f]/8 border-l-2 border-l-[#ff8f6f]/50 pl-[14px]"
          : isData
            ? "bg-[#ff8f6f]/[0.025] border-l-2 border-l-[#ff8f6f]/20 pl-[14px] hover:bg-[#ff8f6f]/[0.04]"
            : "border-l-2 border-l-transparent hover:bg-white/[0.015]"
      }`}
    >
      <span className={`text-[9px] font-mono shrink-0 w-6 text-right tabular-nums ${isData || isSelected ? "text-[#555350]" : "text-[#252525]"}`}>
        #{round.index + 1}
      </span>

      <MiniStageBars stages={round.stages} />

      <StatusBadge status={round.status} selected={isSelected} />

      <span className={`text-[9px] font-mono flex-1 truncate ${isData ? "text-[#4a4846]" : "text-[#1e1e1e]"}`}>
        {isData && preview ? preview : "No change"}
      </span>

      <span className={`text-[9px] font-mono shrink-0 tabular-nums ${isData ? "text-[#3a3939]" : "text-[#1e1e1e]"}`}>
        {totalMs}ms
      </span>

      {isData && !isSelected && (
        <span className="material-symbols-outlined text-[#2e2e2e] group-hover:text-[#494847] transition-colors shrink-0" style={{ fontSize: "11px" }}>
          chevron_right
        </span>
      )}
      {isSelected && (
        <span className="material-symbols-outlined text-[#ff8f6f]/50 shrink-0" style={{ fontSize: "11px" }}>
          arrow_right
        </span>
      )}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────

const INTERVAL_PRESETS = [500, 1000, 2000, 5000];
const MAX_ROUND_PRESETS = [10, 15, 20, 30];

interface PollingPanelProps {
  pollMode: PollMode;
  pollUrl: string;
  pollMethod: HttpMethod;
  onSetPollUrl: (u: string) => void;
  onSetPollMethod: (m: HttpMethod) => void;
  pollRounds: PollRound[];
  currentPollStages: StageResult[];
  currentRoundIdx: number;
  isPolling: boolean;
  pollWaiting: boolean;
  pollIntervalMs: number;
  maxPollRounds: number;
  selectedRoundIdx: number | null;
  onSetInterval: (ms: number) => void;
  onSetMaxRounds: (n: number) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onSelectRound: (idx: number | null) => void;
}

// ── Component ────────────────────────────────────────────────────

export function PollingPanel({
  pollMode,
  pollUrl,
  pollMethod,
  onSetPollUrl,
  onSetPollMethod,
  pollRounds,
  currentPollStages,
  currentRoundIdx,
  isPolling,
  pollWaiting,
  pollIntervalMs,
  maxPollRounds,
  selectedRoundIdx,
  onSetInterval,
  onSetMaxRounds,
  onStart,
  onStop,
  onReset,
  onSelectRound,
}: PollingPanelProps) {
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const isDone    = !isPolling && pollRounds.length > 0;
  const mc        = METHOD_COLORS[pollMethod];

  const totalPolls   = pollRounds.length;
  const emptyPolls   = pollRounds.filter((r) => r.status === 304).length;
  const dataPolls    = pollRounds.filter((r) => r.status === 200).length;
  const wastePercent = totalPolls > 0 ? Math.round((emptyPolls / totalPolls) * 100) : 0;
  const dataPercent  = totalPolls > 0 ? Math.round((dataPolls  / totalPolls) * 100) : 0;

  const urlError = pollMode === "real" && !pollUrl.trim()
    ? "URL required"
    : pollMode === "real" && (() => { try { new URL(pollUrl); return false; } catch { return true; } })()
      ? "Enter a valid URL"
      : null;

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pollRounds.length, currentPollStages.length, pollWaiting]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Request bar — mirrors HTTP RequestBar structure ── */}
      <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] px-4 pt-4 pb-3 space-y-2.5">

        {/* Row 1: input bar */}
        <div className={`flex items-stretch rounded-sm border overflow-hidden transition-colors duration-150 ${
          urlError ? "border-red-500/25" : "border-white/8 focus-within:border-white/16"
        }`}>

          {pollMode === "real" ? (
            <>
              {/* Method selector */}
              <div className="relative shrink-0">
                <select
                  value={pollMethod}
                  onChange={(e) => onSetPollMethod(e.target.value as HttpMethod)}
                  disabled={isPolling}
                  className={`h-full appearance-none bg-[#111] border-r border-white/8 pl-3 pr-7 text-xs font-black font-body cursor-pointer focus:outline-none disabled:cursor-not-allowed ${mc.text}`}
                  style={{ minWidth: "72px" }}
                >
                  {METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
                <span className={`material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 ${mc.text}`} style={{ fontSize: "13px", lineHeight: 1 }}>expand_more</span>
              </div>

              {/* URL input */}
              <input
                value={pollUrl}
                onChange={(e) => onSetPollUrl(e.target.value)}
                disabled={isPolling}
                placeholder="https://api.example.com/events"
                className="flex-1 bg-[#0d0d0d] text-white text-sm font-mono px-4 py-3 focus:outline-none min-w-0 placeholder:text-[#2e2e2e] disabled:opacity-50"
              />
            </>
          ) : (
            /* Virtual mode label */
            <div className="flex items-center gap-2 px-4 flex-1 bg-[#0d0d0d]">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60" />
              <span className="text-[10px] font-bold font-body uppercase tracking-widest text-[#494847]">Virtual</span>
              <span className="text-[9px] font-body text-[#2e2e2e] ml-1">— events fire from the left panel queue</span>
            </div>
          )}

          {/* Divider */}
          <div className="w-px bg-white/8 shrink-0" />

          {/* Start / Stop CTA — same sizing as HTTP Send */}
          {isPolling ? (
            <button
              onClick={onStop}
              className="px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 bg-red-500/10 text-red-400 hover:bg-red-500/20"
            >
              <span className="material-symbols-outlined text-base">stop_circle</span>
              Stop
            </button>
          ) : (
            <button
              onClick={urlError ? undefined : onStart}
              disabled={!!urlError}
              title={urlError ?? undefined}
              className={`px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 ${
                urlError
                  ? "bg-[#1a1919] text-[#3a3939] cursor-not-allowed"
                  : "bg-[#ff8f6f] text-[#5c1400] hover:bg-[#ff7851] active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              }`}
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              Poll
            </button>
          )}
        </div>

        {/* Row 2: sub-bar — interval · max rounds · reset */}
        <div className="flex items-center gap-4 min-w-0 px-2">
          {/* Every N presets */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#494847]">Every</span>
            <div className="flex items-center bg-[#111] border border-white/8 rounded-sm overflow-hidden">
              {INTERVAL_PRESETS.map((ms) => (
                <button key={ms} onClick={() => !isPolling && onSetInterval(ms)} disabled={isPolling}
                  className={`px-2 py-1 text-[9px] font-bold font-mono transition-colors border-r border-white/5 last:border-r-0 disabled:cursor-not-allowed ${
                    pollIntervalMs === ms ? "bg-[#ff8f6f]/12 text-[#ff8f6f]" : "text-[#494847] hover:text-[#adaaaa]"
                  }`}>
                  {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Stop after N presets */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#494847]">Stop after</span>
            <div className="flex items-center bg-[#111] border border-white/8 rounded-sm overflow-hidden">
              {MAX_ROUND_PRESETS.map((n) => (
                <button key={n} onClick={() => !isPolling && onSetMaxRounds(n)} disabled={isPolling}
                  className={`px-2 py-1 text-[9px] font-bold font-mono transition-colors border-r border-white/5 last:border-r-0 disabled:cursor-not-allowed ${
                    maxPollRounds === n ? "bg-[#ff8f6f]/12 text-[#ff8f6f]" : "text-[#494847] hover:text-[#adaaaa]"
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            <span className="text-[9px] font-body text-[#252525]">polls</span>
          </div>

          <div className="flex-1" />

          {isDone && (
            <button onClick={onReset} className="text-[9px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: "12px", lineHeight: 1 }}>refresh</span>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Waste stats bar ── */}
      <AnimatePresence>
        {totalPolls > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden shrink-0"
          >
            <div className="border-b border-white/5 bg-[#0c0c0c] px-4 py-2.5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-bold font-mono text-white tabular-nums">{totalPolls}</span>
                <span className="text-[9px] font-body text-[#3a3939]">sent</span>
                <span className="text-[#1e1e1e]">·</span>
                <span className="text-[11px] font-bold font-mono text-[#333] tabular-nums">{emptyPolls}</span>
                <span className="text-[9px] font-body text-[#2e2e2e]">empty</span>
                <span className="text-[#1e1e1e]">·</span>
                <span className="text-[11px] font-bold font-mono text-green-400 tabular-nums">{dataPolls}</span>
                <span className="text-[9px] font-body text-[#3a3939]">with data</span>
                <div className="flex-1" />
                <span className={`text-[14px] font-bold font-mono tabular-nums ${
                  wastePercent >= 70 ? "text-red-400" : wastePercent >= 40 ? "text-yellow-400" : "text-green-400"
                }`}>{wastePercent}%</span>
                <span className="text-[9px] font-body text-[#3a3939]">wasted</span>
              </div>
              {/* Same height as HTTP timeline bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1919] gap-px">
                <motion.div className="h-full bg-green-500/60 shrink-0 rounded-l-full" animate={{ width: `${dataPercent}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
                <div className="h-full bg-red-500/35 rounded-r-full" style={{ width: `${wastePercent}%` }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Column headers ── */}
      {totalPolls > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/[0.03] shrink-0">
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] w-6 text-right">#</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222]" style={{ width: "96px" }}>Stages</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] w-8 ml-[3px]">Status</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] flex-1">Response</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222]">Time</span>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Empty state — matches HTTP tone */}
        {totalPolls === 0 && !isPolling && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <div className="w-16 h-16 bg-[#1a1919] border border-white/8 rounded-sm flex items-center justify-center">
              <span className="material-symbols-outlined text-[#3a3939] text-3xl">sync</span>
            </div>
            <div>
              <p className="text-sm font-headline font-bold text-[#494847] mb-2">No polls yet</p>
              <p className="text-[10px] font-body text-[#3a3939] leading-relaxed max-w-72">
                {pollMode === "real"
                  ? "Repeats a real HTTP request at a fixed interval — even when no new data is available. Watch how many round trips fire before the response changes."
                  : "Repeats requests at a fixed interval — even when no new data is available. Events fire from the queue on the left; watch how many empty polls happen first."}
              </p>
            </div>
          </div>
        )}

        {/* Completed rounds — animated in */}
        {pollRounds.map((round) => (
          <motion.div
            key={round.index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <PollRoundRow
              round={round}
              isSelected={selectedRoundIdx === round.index}
              onClick={() => onSelectRound(selectedRoundIdx === round.index ? null : round.index)}
            />
          </motion.div>
        ))}

        {/* In-progress round */}
        {currentPollStages.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-[7px] border-b border-white/[0.03] border-l-2 border-l-[#ff8f6f]/10">
            <span className="text-[9px] font-mono shrink-0 w-6 text-right text-[#3a3939] tabular-nums">#{currentRoundIdx + 1}</span>
            <MiniStageBars stages={currentPollStages} />
            <motion.span className="text-[9px] font-mono text-[#2e2e2e]" animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.7 }}>
              ···
            </motion.span>
          </div>
        )}

        {/* Waiting between polls */}
        {pollWaiting && currentPollStages.length === 0 && isPolling && (
          <div className="flex items-center gap-3 px-4 py-[7px]">
            <span className="w-6" />
            <motion.span className="text-[9px] font-body text-[#1e1e1e] italic" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }}>
              waiting {pollIntervalMs < 1000 ? `${pollIntervalMs}ms` : `${pollIntervalMs / 1000}s`} before next poll…
            </motion.span>
          </div>
        )}

        {/* Done hint */}
        {isDone && selectedRoundIdx === null && dataPolls > 0 && (
          <div className="px-4 py-3 text-center">
            <span className="text-[9px] font-body text-[#2e2e2e]">
              Click a <span className="text-[#ff8f6f]/50">200</span> row to inspect its response →
            </span>
          </div>
        )}

        {/* Scroll sentinel */}
        <div ref={sentinelRef} />
      </div>
    </div>
  );
}
