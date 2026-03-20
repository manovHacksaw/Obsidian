"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LongPollPhaseResult, LongPollRound, LongPollRoundStatus, LongPollMode } from "../types";
import {
  LP_PHASE_BAR_COLORS,
  LP_PHASE_TEXT_COLORS,
  LP_STATUS_DISPLAY,
  LP_TIMEOUT_PRESETS_MS,
  LP_MAX_ROUND_PRESETS,
} from "../constants";

// ── Mini phase bars ──────────────────────────────────────────────
// The hold bar has a visual minimum (40%) so it's always dominant —
// this is the core educational signal of long-polling.

function MiniPhaseBars({ phases }: { phases: LongPollPhaseResult[] }) {
  const total = phases.reduce((s, p) => s + Math.max(p.durationMs, 6), 0) || 1;
  return (
    <div className="flex items-center gap-[2px]" style={{ width: "96px" }}>
      {phases.map((p) => {
        const natural = (Math.max(p.durationMs, 6) / total) * 100;
        const pct     = p.phase === "hold" ? Math.max(natural, 40) : natural;
        const color   = LP_PHASE_BAR_COLORS[p.phase] ?? "bg-white/20";
        const active  = p.status === "active";
        return (
          <div
            key={p.phase}
            className={`h-1.5 rounded-[1px] transition-all ${color} ${active ? "opacity-25 animate-pulse" : "opacity-60"}`}
            style={{ width: `${pct}%` }}
            title={`${p.phase}: ${p.durationMs}ms`}
          />
        );
      })}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────

function StatusBadge({ status, selected }: { status: LongPollRoundStatus; selected: boolean }) {
  const s = LP_STATUS_DISPLAY[status];
  return (
    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded tabular-nums ${
      selected ? `${s.bg} ${s.color} opacity-90` : `${s.bg} ${s.color}`
    }`}>
      {s.label}
    </span>
  );
}

// ── Round row ────────────────────────────────────────────────────

function LongPollRoundRow({
  round, isSelected, onClick,
}: {
  round: LongPollRound;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isData    = round.status === "data";
  const preview   = round.responseBody
    ? round.responseBody.replace(/\s+/g, " ").trim().slice(0, 56) + (round.responseBody.length > 56 ? "…" : "")
    : null;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-3 px-4 py-[7px] border-b border-white/[0.03] cursor-pointer transition-colors ${
        isSelected
          ? "bg-amber-500/[0.06] border-l-2 border-l-amber-500/40 pl-[14px]"
          : isData
            ? "bg-green-500/[0.025] border-l-2 border-l-green-500/20 pl-[14px] hover:bg-green-500/[0.04]"
            : "border-l-2 border-l-transparent hover:bg-white/[0.015]"
      }`}
    >
      <span className={`text-[9px] font-mono shrink-0 w-6 text-right tabular-nums ${isData || isSelected ? "text-[#555350]" : "text-[#252525]"}`}>
        #{round.index + 1}
      </span>

      <MiniPhaseBars phases={round.phases} />

      <StatusBadge status={round.status} selected={isSelected} />

      <span className={`text-[9px] font-mono flex-1 truncate ${isData ? "text-[#4a4846]" : "text-[#1e1e1e]"}`}>
        {isData && preview ? preview : round.status === "timeout" ? "Server timeout — no event" : "Connection error"}
      </span>

      {/* Hold duration — amber, the key metric */}
      <span className={`text-[9px] font-mono shrink-0 tabular-nums ${isData ? "text-amber-400/60" : "text-[#1e1e1e]"}`}>
        {round.holdMs}ms
      </span>

      {isData && !isSelected && (
        <span className="material-symbols-outlined text-[#2e2e2e] group-hover:text-[#494847] transition-colors shrink-0" style={{ fontSize: "11px" }}>
          chevron_right
        </span>
      )}
      {isSelected && (
        <span className="material-symbols-outlined text-amber-400/50 shrink-0" style={{ fontSize: "11px" }}>
          arrow_right
        </span>
      )}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────

interface LongPollPanelProps {
  lpMode:            LongPollMode;
  lpUrl:             string;
  onSetLpUrl:        (u: string) => void;
  rounds:            LongPollRound[];
  currentPhases:     LongPollPhaseResult[];
  currentHoldMs:     number;
  currentRoundIdx:   number;
  isConnected:       boolean;
  lpTimeoutMs:       number;
  maxRounds:         number;
  selectedRoundIdx:  number | null;
  onSetTimeoutMs:    (ms: number) => void;
  onSetMaxRounds:    (n: number) => void;
  onConnect:         () => void;
  onDisconnect:      () => void;
  onReset:           () => void;
  onSelectRound:     (idx: number | null) => void;
}

// ── Component ────────────────────────────────────────────────────

export function LongPollPanel({
  lpMode,
  lpUrl,
  onSetLpUrl,
  rounds,
  currentPhases,
  currentHoldMs,
  currentRoundIdx,
  isConnected,
  lpTimeoutMs,
  maxRounds,
  selectedRoundIdx,
  onSetTimeoutMs,
  onSetMaxRounds,
  onConnect,
  onDisconnect,
  onReset,
  onSelectRound,
}: LongPollPanelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isDone      = !isConnected && rounds.length > 0;

  const totalRounds   = rounds.length;
  const dataRounds    = rounds.filter((r) => r.status === "data").length;
  const timeoutRounds = rounds.filter((r) => r.status === "timeout").length;
  const avgHoldMs     = totalRounds > 0
    ? Math.round(rounds.reduce((s, r) => s + r.holdMs, 0) / totalRounds)
    : 0;
  const dataPercent    = totalRounds > 0 ? Math.round((dataRounds    / totalRounds) * 100) : 0;
  const timeoutPercent = totalRounds > 0 ? Math.round((timeoutRounds / totalRounds) * 100) : 0;

  const isHolding     = currentPhases.some((p) => p.phase === "hold" && p.status === "active");

  const urlError = lpMode === "real" && !lpUrl.trim()
    ? "URL required"
    : lpMode === "real" && (() => { try { new URL(lpUrl); return false; } catch { return true; } })()
      ? "Enter a valid URL"
      : null;

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [rounds.length, currentPhases.length, currentHoldMs]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Request bar ── */}
      <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] px-4 pt-4 pb-3 space-y-2.5">

        {/* Row 1: input bar */}
        <div className={`flex items-stretch rounded-sm border overflow-hidden transition-colors duration-150 ${
          urlError ? "border-red-500/25" : "border-white/8 focus-within:border-white/16"
        }`}>

          {lpMode === "real" ? (
            <input
              value={lpUrl}
              onChange={(e) => onSetLpUrl(e.target.value)}
              disabled={isConnected}
              placeholder="https://httpbin.org/delay/4"
              className="flex-1 bg-[#0d0d0d] text-white text-sm font-mono px-4 py-3 focus:outline-none min-w-0 placeholder:text-[#2e2e2e] disabled:opacity-50"
            />
          ) : (
            <div className="flex items-center gap-2 px-4 flex-1 bg-[#0d0d0d]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
              <span className="text-[10px] font-bold font-body uppercase tracking-widest text-[#494847]">Virtual</span>
              <span className="text-[9px] font-body text-[#2e2e2e] ml-1">— events fire from the left panel queue</span>
            </div>
          )}

          <div className="w-px bg-white/8 shrink-0" />

          {isConnected ? (
            <button
              onClick={onDisconnect}
              className="px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 bg-red-500/10 text-red-400 hover:bg-red-500/20"
            >
              <span className="material-symbols-outlined text-base">stop_circle</span>
              Disconnect
            </button>
          ) : (
            <button
              onClick={urlError ? undefined : onConnect}
              disabled={!!urlError}
              title={urlError ?? undefined}
              className={`px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 ${
                urlError
                  ? "bg-[#1a1919] text-[#3a3939] cursor-not-allowed"
                  : "bg-[#ff8f6f] text-[#5c1400] hover:bg-[#ff7851] active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              }`}
            >
              <span className="material-symbols-outlined text-base">link</span>
              Connect
            </button>
          )}
        </div>

        {/* Row 2: sub-bar */}
        <div className="flex items-center gap-4 min-w-0 px-2">

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#494847]">Hold timeout</span>
            <div className="flex items-center bg-[#111] border border-white/8 rounded-sm overflow-hidden">
              {LP_TIMEOUT_PRESETS_MS.map((ms) => (
                <button key={ms} onClick={() => !isConnected && onSetTimeoutMs(ms)} disabled={isConnected}
                  className={`px-2 py-1 text-[9px] font-bold font-mono transition-colors border-r border-white/5 last:border-r-0 disabled:cursor-not-allowed ${
                    lpTimeoutMs === ms ? "bg-amber-500/15 text-amber-400" : "text-[#494847] hover:text-[#adaaaa]"
                  }`}>
                  {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#494847]">Stop after</span>
            <div className="flex items-center bg-[#111] border border-white/8 rounded-sm overflow-hidden">
              {LP_MAX_ROUND_PRESETS.map((n) => (
                <button key={n} onClick={() => !isConnected && onSetMaxRounds(n)} disabled={isConnected}
                  className={`px-2 py-1 text-[9px] font-bold font-mono transition-colors border-r border-white/5 last:border-r-0 disabled:cursor-not-allowed ${
                    maxRounds === n ? "bg-amber-500/15 text-amber-400" : "text-[#494847] hover:text-[#adaaaa]"
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            <span className="text-[9px] font-body text-[#252525]">rounds</span>
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

      {/* ── Stats bar ── */}
      <AnimatePresence>
        {totalRounds > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden shrink-0"
          >
            <div className="border-b border-white/5 bg-[#0c0c0c] px-4 py-2.5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-bold font-mono text-white tabular-nums">{totalRounds}</span>
                <span className="text-[9px] font-body text-[#3a3939]">rounds</span>
                <span className="text-[#1e1e1e]">·</span>
                <span className="text-[11px] font-bold font-mono text-green-400 tabular-nums">{dataRounds}</span>
                <span className="text-[9px] font-body text-[#3a3939]">with data</span>
                <span className="text-[#1e1e1e]">·</span>
                <span className="text-[11px] font-bold font-mono text-amber-400 tabular-nums">{timeoutRounds}</span>
                <span className="text-[9px] font-body text-[#2e2e2e]">timeouts</span>
                <div className="flex-1" />
                <span className="text-[9px] font-body text-[#3a3939]">avg hold</span>
                <span className="text-[14px] font-bold font-mono tabular-nums text-amber-400">{avgHoldMs}ms</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1919] gap-px">
                <motion.div className="h-full bg-green-500/60 rounded-l-full shrink-0" animate={{ width: `${dataPercent}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
                <motion.div className="h-full bg-amber-500/40 rounded-r-full" animate={{ width: `${timeoutPercent}%` }} transition={{ duration: 0.4, ease: "easeOut" }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Column headers ── */}
      {totalRounds > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/[0.03] shrink-0">
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] w-6 text-right">#</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222]" style={{ width: "96px" }}>Phases</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] w-10">Status</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] flex-1">Response</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-amber-500/40">Hold</span>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Empty state */}
        {totalRounds === 0 && !isConnected && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <div className="w-16 h-16 bg-[#1a1919] border border-white/8 rounded-sm flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-400/30 text-3xl">hourglass_empty</span>
            </div>
            <div>
              <p className="text-sm font-headline font-bold text-[#494847] mb-2">No rounds yet</p>
              <p className="text-[10px] font-body text-[#3a3939] leading-relaxed max-w-72">
                {lpMode === "real"
                  ? "The server holds your connection open until data is available — or until the timeout fires. Watch how few round-trips it takes to receive events."
                  : "Connect and watch the server hold each connection open. Events from the left panel trigger immediate responses instead of waiting for the next poll cycle."}
              </p>
            </div>
          </div>
        )}

        {/* Completed rounds */}
        {rounds.map((round) => (
          <motion.div
            key={round.index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <LongPollRoundRow
              round={round}
              isSelected={selectedRoundIdx === round.index}
              onClick={() => onSelectRound(selectedRoundIdx === round.index ? null : round.index)}
            />
          </motion.div>
        ))}

        {/* In-progress round — show connecting or holding */}
        {currentPhases.length > 0 && (
          <div className={`flex items-center gap-3 px-4 py-[7px] border-b border-white/[0.03] border-l-2 ${
            isHolding ? "border-l-amber-500/20 bg-amber-500/[0.02]" : "border-l-blue-500/10"
          }`}>
            <span className="text-[9px] font-mono shrink-0 w-6 text-right text-[#3a3939] tabular-nums">
              #{currentRoundIdx + 1}
            </span>
            <MiniPhaseBars phases={currentPhases} />
            {isHolding ? (
              <motion.span
                className="text-[9px] font-mono text-amber-500/60"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
              >
                Holding… {(currentHoldMs / 1000).toFixed(1)}s
              </motion.span>
            ) : (
              <motion.span
                className="text-[9px] font-mono text-blue-400/40"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
              >
                Connecting…
              </motion.span>
            )}
            <span className="text-[9px] font-mono text-[#1e1e1e] ml-auto tabular-nums">
              {isHolding ? `${currentHoldMs}ms` : ""}
            </span>
          </div>
        )}

        {/* Done hint */}
        {isDone && selectedRoundIdx === null && dataRounds > 0 && (
          <div className="px-4 py-3 text-center">
            <span className="text-[9px] font-body text-[#2e2e2e]">
              Click a <span className="text-green-400/50">DATA</span> row to inspect its response →
            </span>
          </div>
        )}

        <div ref={sentinelRef} />
      </div>
    </div>
  );
}
