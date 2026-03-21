"use client";

import type { SSEMode, SSEEvent, SSESession } from "../types";
import { DEFAULT_SSE_EVENTS, SSE_REAL_PRESETS, getEventTypeStyle } from "../constants";

interface SSELeftPanelProps {
  sseMode:       SSEMode;
  onSetSseMode:  (m: SSEMode) => void;
  sseUrl:        string;
  onSelectUrl:   (url: string) => void;
  events:        SSEEvent[];
  sessions:      SSESession[];
  isStreaming:   boolean;
}

export function SSELeftPanel({
  sseMode,
  onSetSseMode,
  sseUrl,
  onSelectUrl,
  events,
  sessions,
  isStreaming,
}: SSELeftPanelProps) {
  return (
    <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden">

      {/* Virtual / Real toggle */}
      <div className="flex border-b border-white/5 shrink-0">
        {(["virtual", "real"] as const).map((m) => (
          <button
            key={m}
            onClick={() => !isStreaming && onSetSseMode(m)}
            disabled={isStreaming}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-bold font-body uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
              sseMode === m
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

        {sseMode === "real" ? (
          /* ── Real mode: Quick Targets ── */
          <div className="p-4 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">
                Quick Targets
              </span>
              <div className="space-y-1">
                {SSE_REAL_PRESETS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => !isStreaming && onSelectUrl(p.url)}
                    disabled={isStreaming}
                    className={`w-full text-left px-3 py-2 rounded-sm transition-colors border disabled:cursor-not-allowed ${
                      sseUrl === p.url
                        ? "bg-[#ff8f6f]/10 border-[#ff8f6f]/20 text-[#ff8f6f]"
                        : "bg-[#1a1919] border-transparent hover:bg-[#201f1f] text-[#adaaaa] hover:text-white"
                    }`}
                  >
                    <div className="text-[10px] font-bold font-body">{p.label}</div>
                    <div className="text-[9px] font-mono text-[#494847] truncate mt-0.5">{p.url}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* How it works callout */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#3a3939]">How it works</span>
              <div className="px-3 py-2.5 rounded-sm border bg-green-500/5 border-green-500/10">
                <div className="text-[9px] font-body text-[#494847] leading-relaxed space-y-1.5">
                  <p>
                    Point at any SSE endpoint. Your request flows through{" "}
                    <span className="text-green-400/70 font-bold">our server proxy</span> which instruments
                    every byte — connect time, per-event latency, and more.
                  </p>
                  <p className="text-[#3a3939]">
                    CORS is handled server-side. The browser never touches the target directly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Virtual mode: Event Queue ── */
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#494847]">Server Event Stream</span>
              <span className="text-[9px] font-body text-[#2e2e2e]">{events.length}/{DEFAULT_SSE_EVENTS.length} delivered</span>
            </div>

            <div className="px-2 pb-2 pt-2 space-y-1.5">
              {DEFAULT_SSE_EVENTS.map((evt) => {
                const delivered    = events.some((e) => e.id === evt.id);
                const bodyPreview  = evt.data.replace(/\s+/g, " ").trim().slice(0, 55);
                const style        = getEventTypeStyle(evt.eventType);
                return (
                  <div
                    key={evt.id}
                    className={`p-3 rounded-sm border transition-all duration-300 ${
                      delivered ? `${style.bg} ${style.border}` : "bg-[#111] border-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${delivered ? style.text.replace("text-", "bg-") : "bg-[#252525]"}`} />
                      <span className={`text-[9px] font-mono tabular-nums ${delivered ? "text-[#494847]" : "text-[#333]"}`}>
                        +{evt.delayMs / 1000}s
                      </span>
                      <span className={`text-[9px] font-bold font-body px-1 py-px rounded-sm ${delivered ? `${style.bg} ${style.text}` : "bg-[#1a1a1a] text-[#333]"}`} style={{ fontSize: "8px", letterSpacing: "0.1em" }}>
                        {evt.eventType}
                      </span>
                      <span className={`text-[9px] font-body truncate ${delivered ? "text-[#adaaaa]" : "text-[#333]"}`}>
                        {evt.label}
                      </span>
                      {delivered && (
                        <span className={`ml-auto material-symbols-outlined shrink-0 ${style.text}`} style={{ fontSize: "11px" }}>
                          check_circle
                        </span>
                      )}
                    </div>
                    <div className={`text-[9px] font-mono rounded-sm px-2 py-1.5 bg-[#0a0a0a] leading-relaxed ${delivered ? "text-[#3a3939]" : "text-[#222]"}`}>
                      {bodyPreview}…
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Why it's better than long polling */}
            <div className="px-4 pb-4 pt-2 border-t border-white/5 mt-2 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#3a3939]">vs Long Polling</span>
              <div className="space-y-1.5">
                {[
                  { icon: "commit",         text: "One connection for all events — no reconnects" },
                  { icon: "bolt",           text: "Zero latency — events push the instant they fire" },
                  { icon: "savings",        text: "No empty responses, no hold-and-timeout cycles" },
                ].map(({ icon, text }) => (
                  <div key={icon} className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-green-400/40 shrink-0 mt-px" style={{ fontSize: "11px", lineHeight: 1.4 }}>{icon}</span>
                    <span className="text-[9px] font-body text-[#2e2e2e] leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Session history — both modes */}
        {sessions.length > 0 && (
          <div className="p-4 border-t border-white/5 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block">History</span>
            <div className="space-y-1">
              {sessions.slice().reverse().map((s) => (
                <div key={s.id} className="px-3 py-2 rounded-sm bg-[#1a1919] border border-transparent">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm ${
                      s.mode === "real"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-green-500/10 text-green-400"
                    }`}>{s.mode}</span>
                    <span className="text-[9px] font-body text-[#494847]">
                      {s.totalEvents} events · {(s.totalMs / 1000).toFixed(1)}s
                    </span>
                    <span className="ml-auto text-[9px] font-mono text-green-400/60">
                      {s.connectMs}ms connect
                    </span>
                  </div>
                  {s.url && (
                    <div className="text-[9px] font-mono text-[#333] truncate">{s.url}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
