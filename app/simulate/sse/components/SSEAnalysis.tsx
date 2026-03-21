"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SSEEvent, SSEMode, SSEResponseType, SSEConnectionInfo } from "../types";
import { getEventTypeStyle } from "../constants";

interface SSEAnalysisProps {
  events:                 SSEEvent[];
  connectMs:              number;
  streamElapsedMs:        number;
  mode:                   SSEMode;
  responseType:           SSEResponseType;
  connectionInfo:         SSEConnectionInfo | null;
  url?:                   string;
  rightWidth:             number;
  onDragHandleMouseDown:  (e: React.MouseEvent) => void;
}

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0;
}

export function SSEAnalysis({
  events,
  connectMs,
  streamElapsedMs,
  mode,
  responseType,
  connectionInfo,
  url,
  rightWidth,
  onDragHandleMouseDown,
}: SSEAnalysisProps) {
  const isHttp = responseType === "http";
  const [isExpanded, setIsExpanded] = useState(false);

  const totalEvents = events.length;

  // Per-event interval
  const intervals = totalEvents > 1
    ? events.slice(1).map((e, i) => e.elapsedMs - events[i].elapsedMs)
    : [];
  const avgIntervalMs = avg(intervals);
  const minIntervalMs = intervals.length ? Math.min(...intervals) : 0;
  const maxIntervalMs = intervals.length ? Math.max(...intervals) : 0;

  // Event type breakdown
  const typeCounts: Record<string, number> = {};
  events.forEach((e) => { typeCounts[e.eventType] = (typeCounts[e.eventType] ?? 0) + 1; });

  // Bytes estimate
  const totalBytes = events.reduce((s, e) => s + e.data.length, 0);

  // vs Long Polling comparison
  // With long-poll at 5s timeout, equivalent would need ~totalEvents reconnects at minimum
  // but more likely reconnects = totalEvents + (streamElapsedMs / 5000) timeouts
  const equivalentLPRounds = Math.max(
    totalEvents,
    totalEvents + Math.floor((streamElapsedMs - (events[totalEvents - 1]?.elapsedMs ?? 0)) / 5000)
  );
  const savedReconnects = Math.max(0, equivalentLPRounds - 1); // SSE uses 1 connection

  const renderContent = (expanded: boolean) => (
    <div className="flex-1 overflow-y-auto min-h-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={expanded ? "p-5 md:p-6 space-y-6" : "p-4 space-y-5"}
      >

        {/* ── Protocol behavior insight ── */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
            Protocol Behavior
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              {
                label: "Mode",
                value: isHttp ? "HTTP request-response" : "SSE stream",
                color: isHttp ? "text-[#adaaaa]" : "text-green-400",
              },
              {
                label: "Connection",
                value: isHttp ? "Short-lived" : "Persistent",
                color: isHttp ? "text-[#777575]" : "text-green-400",
              },
              {
                label: "Requests made",
                value: "1",
                color: "text-white",
              },
              {
                label: "Data behavior",
                value: isHttp ? "Single payload" : "Streaming chunks",
                color: isHttp ? "text-[#777575]" : "text-green-400",
              },
              ...(connectionInfo ? [{
                label: "Content-Type",
                value: connectionInfo.contentType.split(";")[0].trim() || "unknown",
                color: connectionInfo.isSSE ? "text-green-400" : "text-[#adaaaa]",
              }] : []),
              {
                label: "Server action",
                value: isHttp ? "Respond once, close" : "Keep open, push",
                color: isHttp ? "text-[#494847]" : "text-green-400/80",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#111] border border-white/[0.04] rounded-sm px-2.5 py-2">
                <div className={`text-[10px] font-bold font-mono truncate ${color}`}>{value}</div>
                <div className="text-[8px] font-body text-[#3a3939] mt-0.5 uppercase tracking-[0.12em]">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── vs Long Polling callout (SSE only) ── */}
        {savedReconnects > 0 && !isHttp && (
          <div className="px-3 py-2.5 rounded-sm border bg-green-500/5 border-green-500/15">
            <div className="text-[10px] font-bold font-body text-green-400 mb-1">vs Long Polling</div>
            <div className="text-[9px] font-body text-[#494847] leading-relaxed">
              SSE used <span className="text-green-400/80 font-bold">1 connection</span> to deliver {totalEvents} event{totalEvents !== 1 ? "s" : ""}.{" "}
              Long polling at 5s timeout would have needed ~{equivalentLPRounds} round-trips —{" "}
              <span className="text-green-400/70">{savedReconnects} fewer reconnect{savedReconnects !== 1 ? "s" : ""}.</span>
            </div>
          </div>
        )}

        {/* ── Summary stats ── */}
        <div className={expanded ? "grid grid-cols-2 lg:grid-cols-3 gap-2.5" : "grid grid-cols-2 gap-2"}>
          {[
            { label: "Events recv'd",  value: totalEvents,                    color: "text-green-400" },
            { label: "Connect time",   value: `${connectMs}ms`,               color: "text-blue-400"  },
            { label: "Stream open",    value: `${(streamElapsedMs / 1000).toFixed(1)}s`,  color: "text-white"   },
            { label: "Avg interval",   value: avgIntervalMs > 0 ? `${avgIntervalMs}ms` : "—", color: "text-green-400/80" },
            { label: "Data received",  value: `${totalBytes}B`,               color: "text-[#adaaaa]" },
            { label: "Connections",    value: "1",                            color: "text-green-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#111] border border-white/[0.04] rounded-sm px-3 py-2.5">
              <div className={`text-sm font-bold font-mono tabular-nums ${color}`}>{value}</div>
              <div className="text-[9px] font-body text-[#3a3939] mt-0.5 uppercase tracking-[0.12em]">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Event type breakdown ── */}
        {Object.keys(typeCounts).length > 0 && (
          <div>
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block mb-2">
              Event types
            </span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(typeCounts).map(([type, count]) => {
                const s = getEventTypeStyle(type);
                return (
                  <div key={type} className={`flex items-center gap-1.5 px-2 py-1 rounded-sm border ${s.bg} ${s.border}`}>
                    <span className={`text-[9px] font-bold font-body ${s.text}`}>{type}</span>
                    <span className="text-[9px] font-mono text-[#494847] tabular-nums">×{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Event timeline dots ── */}
        {totalEvents > 0 && (
          <div>
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block mb-2">
              Event timeline
            </span>
            <div className="flex flex-wrap gap-[3px]">
              {events.map((e) => {
                const s = getEventTypeStyle(e.eventType);
                return (
                  <div
                    key={e.index}
                    title={`#${e.index + 1} — ${e.eventType} (+${e.elapsedMs}ms)`}
                    className={`w-2 h-2 rounded-[1px] ${s.bg.replace("bg-", "bg-").replace("/10", "/60")}`}
                  />
                );
              })}
            </div>
            <p className="text-[9px] font-body text-[#2e2e2e] mt-2 leading-relaxed">
              All events delivered over a single connection — no reconnects, no empty responses.
            </p>
          </div>
        )}

        {/* ── Interval timing (expanded only) ── */}
        {expanded && intervals.length > 0 && (
          <div className="space-y-2.5">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
              Inter-event latency
            </span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { label: "Min",  value: `${minIntervalMs}ms` },
                { label: "Avg",  value: `${avgIntervalMs}ms` },
                { label: "Max",  value: `${maxIntervalMs}ms` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#111] border border-white/[0.04] rounded-sm px-3 py-2.5">
                  <div className="text-sm font-bold font-mono tabular-nums text-green-400/80">{value}</div>
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
                text: `${totalEvents} event${totalEvents !== 1 ? "s" : ""} delivered over 1 connection in ${(streamElapsedMs / 1000).toFixed(1)}s — zero reconnects.`,
              },
              {
                icon: "bolt",
                color: "text-green-400/60",
                text: `Connect overhead: ${connectMs}ms. After that, events push instantly — no polling cycle delay.`,
              },
              ...(savedReconnects > 0 ? [{
                icon: "trending_down",
                color: "text-green-400/50",
                text: `Saved ~${savedReconnects} HTTP round-trip${savedReconnects > 1 ? "s" : ""} vs long polling. SSE scales cleanly with event frequency.`,
              }] : []),
              {
                icon: "info",
                color: "text-[#494847]",
                text: "Browsers auto-reconnect if the stream drops (Last-Event-ID header). Dropped events are replayed from the last known ID.",
              },
            ].map(({ icon, color, text }) => (
              <div key={icon} className="flex items-start gap-2.5 px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
                <span className={`material-symbols-outlined shrink-0 mt-px ${color}`} style={{ fontSize: "12px", lineHeight: 1.4 }}>{icon}</span>
                <span className="text-[9px] font-body text-[#3a3939] leading-relaxed">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Event log (expanded only) ── */}
        {expanded && totalEvents > 0 && (
          <div className="space-y-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
              Event log
            </span>
            <div className="border border-white/[0.05] bg-[#111] rounded-sm overflow-hidden">
              <div className="grid grid-cols-[40px_72px_1fr_72px] px-3 py-2 text-[9px] font-bold font-body uppercase tracking-[0.12em] text-[#3a3939] border-b border-white/[0.05]">
                <span>#</span>
                <span>Type</span>
                <span>Data</span>
                <span className="text-right">Elapsed</span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {events.map((e) => {
                  const preview = e.data.replace(/\s+/g, " ").trim().slice(0, 60);
                  return (
                    <div key={e.index} className="grid grid-cols-[40px_72px_1fr_72px] px-3 py-2 text-[10px] border-b border-white/[0.03] last:border-b-0">
                      <span className="font-mono tabular-nums text-[#555350]">#{e.index + 1}</span>
                      <span className={`font-mono tabular-nums ${getEventTypeStyle(e.eventType).text}`}>{e.eventType}</span>
                      <span className="text-[#494847] truncate">{preview}</span>
                      <span className="font-mono tabular-nums text-right text-green-400/50">+{e.elapsedMs}ms</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Better for ── */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
            SSE is best for
          </span>
          <div className="space-y-1.5">
            {[
              { label: "Live feeds & dashboards",  desc: "Stock tickers, metrics, activity streams — high-frequency one-way push." },
              { label: "Notifications & alerts",   desc: "Server pushes events as they happen. Browser reconnects automatically if dropped." },
              { label: "Log / CI streaming",        desc: "Build output, deploy logs, test results — long-running streams where WebSocket is overkill." },
            ].map(({ label, desc }) => (
              <div key={label} className="px-3 py-2.5 rounded-sm border bg-green-500/5 border-green-500/10">
                <div className="text-[10px] font-bold font-body text-green-400 mb-1">{label}</div>
                <div className="text-[9px] font-body text-[#3a3939] leading-relaxed">{desc}</div>
              </div>
            ))}
            <div className="px-3 py-2.5 rounded-sm border bg-purple-500/5 border-purple-500/10">
              <div className="text-[10px] font-bold font-body text-purple-400 mb-1">Need bidirectional? → WebSocket</div>
              <div className="text-[9px] font-body text-[#3a3939] leading-relaxed">SSE is server→client only. For chat, collaboration, or games — use WebSocket.</div>
            </div>
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
        <span className="material-symbols-outlined text-green-400/70 text-base">analytics</span>
        <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">
          Session Analysis
        </span>
        <div className="flex-1" />
        {mode === "real" && url && (
          <span className="text-[9px] font-mono text-[#2e2e2e] truncate max-w-32" title={url}>{url}</span>
        )}
        {mode === "virtual" && (
          <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-green-500/10 text-green-400">virtual</span>
        )}
        <button
          onClick={() => setIsExpanded(true)}
          disabled={totalEvents === 0}
          className={`ml-2 p-1 rounded-sm transition-colors ${
            totalEvents === 0 ? "text-[#2e2e2e] cursor-not-allowed" : "text-[#777575] hover:text-[#ff8f6f] hover:bg-[#1a1919]"
          }`}
          title={totalEvents === 0 ? "Run a session to analyze" : "Expand analysis"}
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
                <span className="material-symbols-outlined text-green-400/70 text-base">analytics</span>
                <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">
                  Detailed Session Analysis
                </span>
                <div className="flex-1" />
                {mode === "real" && url && (
                  <span className="text-[9px] font-mono text-[#2e2e2e] truncate max-w-80" title={url}>{url}</span>
                )}
                {mode === "virtual" && (
                  <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-green-500/10 text-green-400">virtual</span>
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
