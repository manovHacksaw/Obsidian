"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LongPollRound, LongPollMode } from "../types";
import { LP_PHASE_TEXT_COLORS } from "../constants";

interface LongPollAnalysisProps {
  rounds:      LongPollRound[];
  timeoutMs:   number;
  mode:        LongPollMode;
  lpUrl?:      string;
  rightWidth:  number;
  onDragHandleMouseDown: (e: React.MouseEvent) => void;
}

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0;
}

function percentile(sortedNums: number[], p: number): number {
  if (!sortedNums.length) return 0;
  const idx = Math.min(sortedNums.length - 1, Math.max(0, Math.ceil(sortedNums.length * p) - 1));
  return sortedNums[idx];
}

export function LongPollAnalysis({
  rounds,
  timeoutMs,
  mode,
  lpUrl,
  rightWidth,
  onDragHandleMouseDown,
}: LongPollAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalRounds    = rounds.length;
  const dataRounds     = rounds.filter((r) => r.status === "data").length;
  const timeoutRounds  = rounds.filter((r) => r.status === "timeout").length;
  const errorRounds    = rounds.filter((r) => r.status === "error").length;
  const timeoutRate    = totalRounds > 0 ? Math.round((timeoutRounds / totalRounds) * 100) : 0;
  const dataPercent    = totalRounds > 0 ? Math.round((dataRounds    / totalRounds) * 100) : 0;

  const avgHoldMs    = avg(rounds.map((r) => r.holdMs));
  const avgConnectMs = avg(rounds.flatMap((r) => r.phases.filter((p) => p.phase === "connect").map((p) => p.durationMs)));
  const avgRespondMs = avg(rounds.flatMap((r) => r.phases.filter((p) => p.phase === "respond").map((p) => p.durationMs)));

  // Reconnects per event — ideally ≈ 1
  const reconnectsPerEvent = dataRounds > 0 ? (totalRounds / dataRounds).toFixed(1) : "∞";

  // vs short polling comparison: how many 1s-interval polls would have fired?
  const sessionMs              = rounds.reduce((s, r) => s + r.totalMs, 0);
  const equivalentShortPolls   = Math.max(0, Math.round(sessionMs / 1000));
  const savedRequests          = Math.max(0, equivalentShortPolls - totalRounds);

  // Phase breakdown averages
  const phaseAvgs = (["connect", "hold", "respond"] as const).map((phase) => ({
    phase,
    avgMs: phase === "connect" ? avgConnectMs : phase === "hold" ? avgHoldMs : avgRespondMs,
  }));
  const maxPhaseAvg = Math.max(...phaseAvgs.map((p) => p.avgMs), 1);

  // First data round
  const firstDataIdx     = rounds.findIndex((r) => r.status === "data");
  const roundsBeforeData = firstDataIdx === -1 ? totalRounds : firstDataIdx;

  // Hold time percentiles
  const sortedHoldMs = [...rounds.map((r) => r.holdMs)].sort((a, b) => a - b);
  const minHoldMs    = sortedHoldMs[0] ?? 0;
  const p50HoldMs    = percentile(sortedHoldMs, 0.5);
  const p95HoldMs    = percentile(sortedHoldMs, 0.95);
  const maxHoldMs    = sortedHoldMs[sortedHoldMs.length - 1] ?? 0;

  const renderContent = (expanded: boolean) => (
    <div className="flex-1 overflow-y-auto min-h-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={expanded ? "p-5 md:p-6 space-y-6" : "p-4 space-y-5"}
      >

        {/* ── vs Short Polling callout ── */}
        {equivalentShortPolls > 0 && (
          <div className="px-3 py-2.5 rounded-sm border bg-amber-500/5 border-amber-500/15">
            <div className="text-[10px] font-bold font-body text-amber-400 mb-1">vs Short Polling</div>
            <div className="text-[9px] font-body text-[#494847] leading-relaxed">
              For the same {dataRounds} event{dataRounds !== 1 ? "s" : ""}, short polling at 1s intervals
              would have used ~{equivalentShortPolls} requests.{" "}
              Long polling used {totalRounds} — {savedRequests > 0 ? (
                <span className="text-green-400/70">{savedRequests} fewer.</span>
              ) : "about the same."}
            </div>
          </div>
        )}

        {/* ── Summary stats ── */}
        <div className={expanded ? "grid grid-cols-2 lg:grid-cols-3 gap-2.5" : "grid grid-cols-2 gap-2"}>
          {[
            { label: "Rounds",        value: totalRounds,        color: "text-white" },
            { label: "Events recv'd", value: dataRounds,         color: "text-green-400" },
            { label: "Timeouts",      value: timeoutRounds,      color: "text-amber-400" },
            { label: "Timeout rate",  value: `${timeoutRate}%`,  color: timeoutRate >= 70 ? "text-amber-400" : timeoutRate >= 40 ? "text-yellow-400" : "text-green-400" },
            { label: "Avg hold",      value: `${avgHoldMs}ms`,   color: "text-amber-400/80" },
            { label: "RTT / event",   value: reconnectsPerEvent, color: "text-[#adaaaa]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#111] border border-white/[0.04] rounded-sm px-3 py-2.5">
              <div className={`text-sm font-bold font-mono tabular-nums ${color}`}>{value}</div>
              <div className="text-[9px] font-body text-[#3a3939] mt-0.5 uppercase tracking-[0.12em]">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Round outcome dots ── */}
        <div>
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block mb-2">
            Round outcomes
          </span>
          <div className="flex flex-wrap gap-[3px]">
            {rounds.map((r) => (
              <div
                key={r.index}
                title={`#${r.index + 1} — ${r.status} (hold: ${r.holdMs}ms)`}
                className={`w-2 h-2 rounded-[1px] ${
                  r.status === "data"
                    ? "bg-green-500/70"
                    : r.status === "timeout"
                      ? "bg-amber-500/40"
                      : "bg-red-500/50"
                }`}
              />
            ))}
          </div>
          <p className="text-[9px] font-body text-[#2e2e2e] mt-2 leading-relaxed">
            {dataRounds === 0
              ? "No events received during this session."
              : roundsBeforeData > 0
                ? `First event after ${roundsBeforeData} timeout round${roundsBeforeData > 1 ? "s" : ""} — server held for ${timeoutMs / 1000}s each before giving up.`
                : "First round immediately had data."}
          </p>
        </div>

        {/* ── Data vs timeout ratio bar ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939]">Data vs timeout ratio</span>
            <span className="text-[11px] font-bold font-mono tabular-nums text-amber-400">{timeoutRate}% timeout</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1919] gap-px">
            <motion.div
              className="h-full bg-green-500/60 rounded-l-full shrink-0"
              initial={{ width: 0 }}
              animate={{ width: `${dataPercent}%` }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            />
            <motion.div
              className="h-full bg-amber-500/40 rounded-r-full"
              initial={{ width: 0 }}
              animate={{ width: `${timeoutRate}%` }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            />
          </div>
        </div>

        {/* ── Phase breakdown ── */}
        <div>
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block mb-2.5">
            Avg time per phase
          </span>
          <div className="space-y-1.5">
            {phaseAvgs.map(({ phase, avgMs }) => {
              const color = LP_PHASE_TEXT_COLORS[phase] ?? "text-white/40";
              const barW  = Math.round((avgMs / maxPhaseAvg) * 100);
              return (
                <div key={phase} className="flex items-center gap-2">
                  <span className={`text-[9px] font-body w-16 shrink-0 capitalize ${color}`}>{phase}</span>
                  <div className="flex-1 bg-[#1a1919] rounded-[1px] h-1 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-[1px] ${
                        phase === "connect" ? "bg-blue-500/50"
                        : phase === "hold"    ? "bg-amber-500/50"
                        : "bg-green-500/50"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${barW}%` }}
                      transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[#3a3939] tabular-nums w-12 text-right shrink-0">
                    {avgMs}ms
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] font-body text-[#2e2e2e] mt-2 leading-relaxed">
            The <span className="text-amber-400/60 font-bold">hold</span> phase dominates — time from request sent to first byte received (TTFB).
            {mode === "real" && (
              <span className="text-[#2a2a2a]"> In real mode this is TTFB only — a slow server and a genuine long-poll server are indistinguishable on the wire.</span>
            )}
          </p>
        </div>

        {/* ── Detailed hold latency (expanded only) ── */}
        {expanded && totalRounds > 0 && (
          <div className="space-y-2.5">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
              Hold latency distribution
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: "Min",  value: `${minHoldMs}ms` },
                { label: "P50",  value: `${p50HoldMs}ms` },
                { label: "P95",  value: `${p95HoldMs}ms` },
                { label: "Max",  value: `${maxHoldMs}ms` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#111] border border-white/[0.04] rounded-sm px-3 py-2.5">
                  <div className="text-sm font-bold font-mono tabular-nums text-amber-400/80">{value}</div>
                  <div className="text-[9px] font-body text-[#3a3939] mt-0.5 uppercase tracking-[0.12em]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Insights ── */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">Insights</span>
          <div className="space-y-1.5">
            {[
              {
                icon: "commit",
                color: "text-green-400/70",
                text: `${totalRounds} round-trip${totalRounds !== 1 ? "s" : ""} delivered ${dataRounds} event${dataRounds !== 1 ? "s" : ""} — ${reconnectsPerEvent} requests per event.`,
              },
              {
                icon: "timer",
                color: "text-amber-400/70",
                text: mode === "real"
                  ? `Avg TTFB: ${avgHoldMs}ms — time from request to first byte. Long-polling servers intentionally delay this; a slow server produces the same measurement.`
                  : `Average hold: ${avgHoldMs}ms. Virtual server held each connection open before firing the event.`,
              },
              ...(timeoutRate > 60 ? [{
                icon: "info",
                color: "text-amber-400/60",
                text: `High timeout rate (${timeoutRate}%). Events arrive less often than your hold timeout — consider increasing it to reduce round-trips.`,
              }] : []),
              ...(errorRounds > 0 ? [{
                icon: "error",
                color: "text-red-400/70",
                text: `${errorRounds} connection error${errorRounds > 1 ? "s" : ""} occurred. Check the URL and network.`,
              }] : []),
              {
                icon: "trending_down",
                color: "text-[#494847]",
                text: savedRequests > 0
                  ? `Saved ~${savedRequests} requests vs short polling at 1s intervals.`
                  : "At this event frequency, long-polling and short-polling produce a similar request count.",
              },
            ].map(({ icon, color, text }) => (
              <div key={icon} className="flex items-start gap-2.5 px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
                <span className={`material-symbols-outlined shrink-0 mt-px ${color}`} style={{ fontSize: "12px", lineHeight: 1.4 }}>{icon}</span>
                <span className="text-[9px] font-body text-[#3a3939] leading-relaxed">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Round log (expanded only) ── */}
        {expanded && totalRounds > 0 && (
          <div className="space-y-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
              Round log
            </span>
            <div className="border border-white/[0.05] bg-[#111] rounded-sm overflow-hidden">
              <div className="grid grid-cols-[48px_56px_1fr_80px] px-3 py-2 text-[9px] font-bold font-body uppercase tracking-[0.12em] text-[#3a3939] border-b border-white/[0.05]">
                <span>Round</span>
                <span>Status</span>
                <span>Preview</span>
                <span className="text-right">Hold</span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {rounds.map((r) => {
                  const preview = r.status === "data" && r.responseBody
                    ? r.responseBody.replace(/\s+/g, " ").trim().slice(0, 70)
                    : r.status === "timeout" ? "Server timeout" : "Error";
                  return (
                    <div key={r.index} className="grid grid-cols-[48px_56px_1fr_80px] px-3 py-2 text-[10px] border-b border-white/[0.03] last:border-b-0">
                      <span className="font-mono tabular-nums text-[#555350]">#{r.index + 1}</span>
                      <span className={`font-mono tabular-nums ${r.status === "data" ? "text-green-400" : r.status === "timeout" ? "text-amber-400" : "text-red-400"}`}>{r.status}</span>
                      <span className="text-[#494847] truncate">{preview}</span>
                      <span className="font-mono tabular-nums text-right text-amber-400/50">{r.holdMs}ms</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Better alternatives ── */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
            Even better alternatives
          </span>
          <div className="space-y-1.5">
            {[
              {
                label: "Server-Sent Events",
                desc: "One persistent HTTP connection. Server pushes data as it happens — zero reconnects, zero empty responses.",
                color: "text-green-400",
                bg: "bg-green-500/8",
                border: "border-green-500/15",
              },
              {
                label: "WebSocket",
                desc: "Full-duplex channel. Both sides send messages at any time. Lowest latency, smallest per-message overhead.",
                color: "text-purple-400",
                bg: "bg-purple-500/8",
                border: "border-purple-500/15",
              },
            ].map(({ label, desc, color, bg, border }) => (
              <div key={label} className={`px-3 py-2.5 rounded-sm border ${bg} ${border}`}>
                <div className={`text-[10px] font-bold font-body mb-1 ${color}`}>{label}</div>
                <div className="text-[9px] font-body text-[#3a3939] leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>

      </motion.div>
    </div>
  );

  return (
    <div
      className="relative shrink-0 border-l border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden"
      style={{ width: rightWidth }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragHandleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#ff8f6f]/20 transition-colors z-10"
        style={{ marginLeft: -1 }}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0">
        <span className="material-symbols-outlined text-amber-400/70 text-base">analytics</span>
        <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">
          Session Analysis
        </span>
        <div className="flex-1" />
        {mode === "real" && lpUrl && (
          <span className="text-[9px] font-mono text-[#2e2e2e] truncate max-w-32" title={lpUrl}>{lpUrl}</span>
        )}
        {mode === "virtual" && (
          <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-400">virtual</span>
        )}
        <button
          onClick={() => setIsExpanded(true)}
          disabled={totalRounds === 0}
          className={`ml-2 p-1 rounded-sm transition-colors ${
            totalRounds === 0 ? "text-[#2e2e2e] cursor-not-allowed" : "text-[#777575] hover:text-[#ff8f6f] hover:bg-[#1a1919]"
          }`}
          title={totalRounds === 0 ? "Run a session to analyze" : "Expand analysis"}
          aria-label="Expand analysis"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px", lineHeight: 1 }}>open_in_full</span>
        </button>
      </div>

      {renderContent(false)}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="fixed inset-0 z-[80] bg-black/75 p-3 md:p-7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              className="w-full h-full max-w-6xl mx-auto bg-[#0e0e0e] border border-white/10 rounded-sm flex flex-col overflow-hidden"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0 bg-[#0a0a0a]">
                <span className="material-symbols-outlined text-amber-400/70 text-base">analytics</span>
                <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">
                  Detailed Session Analysis
                </span>
                <div className="flex-1" />
                {mode === "real" && lpUrl && (
                  <span className="text-[9px] font-mono text-[#2e2e2e] truncate max-w-80" title={lpUrl}>{lpUrl}</span>
                )}
                {mode === "virtual" && (
                  <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-400">virtual</span>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded-sm text-[#777575] hover:text-white hover:bg-[#1a1919] transition-colors"
                  title="Close"
                  aria-label="Close detailed analysis"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px", lineHeight: 1 }}>close</span>
                </button>
              </div>
              {renderContent(true)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
