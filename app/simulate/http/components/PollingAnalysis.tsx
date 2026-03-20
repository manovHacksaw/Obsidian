"use client";

import { motion } from "framer-motion";
import type { PollRound, PollMode } from "../types";
import { STAGE_TEXT_COLORS, STAGE_DEFS } from "../constants";

interface PollingAnalysisProps {
  rounds: PollRound[];
  intervalMs: number;
  mode: PollMode;
  pollUrl?: string;
  rightWidth: number;
  onDragHandleMouseDown: (e: React.MouseEvent) => void;
}

// ── helpers ──────────────────────────────────────────────────────

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0;
}

// ── Component ────────────────────────────────────────────────────

export function PollingAnalysis({
  rounds,
  intervalMs,
  mode,
  pollUrl,
  rightWidth,
  onDragHandleMouseDown,
}: PollingAnalysisProps) {
  const totalRounds = rounds.length;
  const dataRounds  = rounds.filter((r) => r.status === 200).length;
  const emptyRounds = totalRounds - dataRounds;
  const wastePercent = totalRounds > 0 ? Math.round((emptyRounds / totalRounds) * 100) : 0;
  const dataPercent  = 100 - wastePercent;

  // Total session time (sum of all round durations + waiting gaps)
  const totalRoundMs = rounds.reduce((s, r) => {
    return s + r.stages.filter((st) => st.status !== "skipped").reduce((a, st) => a + st.duration, 0);
  }, 0);
  const sessionMs = (totalRounds - 1) * intervalMs + totalRoundMs / totalRounds;

  // Avg round-trip
  const avgRoundMs = avg(rounds.map((r) =>
    r.stages.filter((s) => s.status !== "skipped").reduce((a, s) => a + s.duration, 0)
  ));

  // First data round index (0-based)
  const firstDataIdx = rounds.findIndex((r) => r.status === 200);
  const pollsBeforeFirstData = firstDataIdx === -1 ? totalRounds : firstDataIdx;

  // Longest gap between consecutive 200s
  const dataIndices = rounds.reduce<number[]>((acc, r, i) => r.status === 200 ? [...acc, i] : acc, []);
  const gaps = dataIndices.length > 1
    ? dataIndices.slice(1).map((idx, i) => idx - dataIndices[i])
    : [];
  const maxGap = gaps.length ? Math.max(...gaps) : 0;

  // Per-stage avg (only stages that appear in all rounds)
  const stageIds = ["dns", "tcp", "tls", "request", "processing", "response"] as const;
  const stageAvgs = stageIds.map((id) => {
    const durations = rounds.flatMap((r) =>
      r.stages.filter((s) => s.id === id && s.status !== "skipped").map((s) => s.duration)
    );
    return { id, avg: avg(durations), present: durations.length > 0 };
  }).filter((s) => s.present);

  const maxStageAvg = Math.max(...stageAvgs.map((s) => s.avg), 1);

  // Estimated wasted bandwidth (rough: ~800 bytes per empty HTTP round-trip headers)
  const wastedKB = Math.round((emptyRounds * 800) / 1024);

  // Max latency to first data
  const maxLatencyMs = pollsBeforeFirstData * intervalMs;

  return (
    <div
      className="shrink-0 border-l border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden"
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
        <span className="material-symbols-outlined text-[#ff8f6f]/70 text-base">analytics</span>
        <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">
          Session Analysis
        </span>
        <div className="flex-1" />
        {mode === "real" && pollUrl && (
          <span className="text-[9px] font-mono text-[#2e2e2e] truncate max-w-32" title={pollUrl}>{pollUrl}</span>
        )}
        {mode === "virtual" && (
          <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-purple-500/15 text-purple-400">virtual</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="p-4 space-y-5"
        >

          {/* ── Summary stats ── */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Requests",    value: totalRounds,                color: "text-white" },
              { label: "With Data",   value: dataRounds,                 color: "text-green-400" },
              { label: "Empty",       value: emptyRounds,                color: "text-[#494847]" },
              { label: "Wasted",      value: `${wastePercent}%`,         color: wastePercent >= 70 ? "text-red-400" : wastePercent >= 40 ? "text-yellow-400" : "text-green-400" },
              { label: "Avg RTT",     value: `${avgRoundMs}ms`,          color: "text-[#adaaaa]" },
              { label: "Interval",    value: intervalMs < 1000 ? `${intervalMs}ms` : `${intervalMs / 1000}s`, color: "text-[#adaaaa]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#111] border border-white/[0.04] rounded-sm px-3 py-2.5">
                <div className={`text-sm font-bold font-mono tabular-nums ${color}`}>{value}</div>
                <div className="text-[9px] font-body text-[#3a3939] mt-0.5 uppercase tracking-[0.12em]">{label}</div>
              </div>
            ))}
          </div>

          {/* ── Round-by-round timeline dots ── */}
          <div>
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block mb-2">
              Data arrivals
            </span>
            <div className="flex flex-wrap gap-[3px]">
              {rounds.map((r) => (
                <div
                  key={r.index}
                  title={`#${r.index + 1} — ${r.status}`}
                  className={`w-2 h-2 rounded-[1px] transition-colors ${
                    r.status === 200 ? "bg-green-500/70" : "bg-white/[0.06]"
                  }`}
                />
              ))}
            </div>
            <p className="text-[9px] font-body text-[#2e2e2e] mt-2 leading-relaxed">
              {dataRounds === 0
                ? "No new data arrived during this session."
                : `Data arrived in ${dataRounds} of ${totalRounds} polls. ${pollsBeforeFirstData > 0 ? `First data after ${pollsBeforeFirstData} empty poll${pollsBeforeFirstData > 1 ? "s" : ""}.` : "First poll had data."}`}
            </p>
          </div>

          {/* ── Waste bar ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939]">Waste ratio</span>
              <span className={`text-[11px] font-bold font-mono tabular-nums ${
                wastePercent >= 70 ? "text-red-400" : wastePercent >= 40 ? "text-yellow-400" : "text-green-400"
              }`}>{wastePercent}% empty</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-[#1a1919] gap-px">
              <motion.div
                className="h-full bg-green-500/60 rounded-l-full shrink-0"
                initial={{ width: 0 }}
                animate={{ width: `${dataPercent}%` }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              />
              <div className="h-full bg-red-500/35 rounded-r-full flex-1" />
            </div>
          </div>

          {/* ── Stage breakdown ── */}
          {stageAvgs.length > 0 && (
            <div>
              <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block mb-2.5">
                Avg time per stage
              </span>
              <div className="space-y-1.5">
                {stageAvgs.map(({ id, avg: avgMs }) => {
                  const def   = STAGE_DEFS.find((d) => d.id === id);
                  const color = STAGE_TEXT_COLORS[id as keyof typeof STAGE_TEXT_COLORS] ?? "text-white/40";
                  const barW  = Math.round((avgMs / maxStageAvg) * 100);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className={`text-[9px] font-body w-20 shrink-0 truncate ${color}`}>
                        {def?.label ?? id}
                      </span>
                      <div className="flex-1 bg-[#1a1919] rounded-[1px] h-1 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-[1px] ${color.replace("text-", "bg-").replace("-400", "-500").replace("-300", "-500")}`}
                          style={{ opacity: 0.5 }}
                          initial={{ width: 0 }}
                          animate={{ width: `${barW}%` }}
                          transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[#3a3939] tabular-nums w-10 text-right shrink-0">
                        {avgMs}ms
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Efficiency insights ── */}
          <div className="space-y-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
              Efficiency insights
            </span>
            <div className="space-y-1.5">
              {[
                {
                  icon: "wifi_off",
                  color: "text-red-400/70",
                  text: `${emptyRounds} request${emptyRounds !== 1 ? "s" : ""} completed a full TCP round-trip and received no useful data.`,
                },
                {
                  icon: "timer",
                  color: "text-yellow-400/70",
                  text: maxLatencyMs > 0
                    ? `Worst-case latency to new data: ${maxLatencyMs >= 1000 ? `${(maxLatencyMs / 1000).toFixed(1)}s` : `${maxLatencyMs}ms`} (${pollsBeforeFirstData} × interval).`
                    : "First poll already had data — best case scenario.",
                },
                ...(maxGap > 1 ? [{
                  icon: "trending_down",
                  color: "text-orange-400/70",
                  text: `Longest gap between data responses: ${maxGap} consecutive empty polls.`,
                }] : []),
                {
                  icon: "data_usage",
                  color: "text-[#494847]",
                  text: `≈${wastedKB} KB of HTTP headers sent for no new data (estimated).`,
                },
              ].map(({ icon, color, text }) => (
                <div key={icon} className="flex items-start gap-2.5 px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
                  <span className={`material-symbols-outlined shrink-0 mt-px ${color}`} style={{ fontSize: "12px", lineHeight: 1.4 }}>{icon}</span>
                  <span className="text-[9px] font-body text-[#3a3939] leading-relaxed">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Consider instead ── */}
          <div className="space-y-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
              Better alternatives
            </span>
            <div className="space-y-1.5">
              {[
                {
                  label: "Long Polling",
                  desc: "Server holds the connection open until new data is available, then responds. One round-trip per event.",
                  color: "text-blue-400",
                  bg: "bg-blue-500/8",
                  border: "border-blue-500/15",
                },
                {
                  label: "Server-Sent Events",
                  desc: "Server pushes events over a persistent HTTP connection. Zero client polling — data arrives the moment it's ready.",
                  color: "text-green-400",
                  bg: "bg-green-500/8",
                  border: "border-green-500/15",
                },
                {
                  label: "WebSocket",
                  desc: "Full-duplex channel. Both sides send messages any time. Lowest latency, zero overhead per message.",
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
    </div>
  );
}
