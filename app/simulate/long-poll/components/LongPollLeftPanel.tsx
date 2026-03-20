"use client";

import type { LongPollMode, LongPollSession } from "../types";
import { DEFAULT_LP_EVENTS, LP_REAL_PRESETS, type LongPollEvent } from "../constants";

interface LongPollLeftPanelProps {
  lpMode:           LongPollMode;
  onSetLpMode:      (m: LongPollMode) => void;
  lpUrl:            string;
  onSelectTarget:   (url: string) => void;
  firedEventIds:    string[];
  sessions:         LongPollSession[];
  isConnected:      boolean;
}

export function LongPollLeftPanel({
  lpMode,
  onSetLpMode,
  lpUrl,
  onSelectTarget,
  firedEventIds,
  sessions,
  isConnected,
}: LongPollLeftPanelProps) {
  return (
    <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden">

      {/* Virtual / Real toggle */}
      <div className="flex border-b border-white/5 shrink-0">
        {(["virtual", "real"] as const).map((m) => (
          <button
            key={m}
            onClick={() => !isConnected && onSetLpMode(m)}
            disabled={isConnected}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-bold font-body uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
              lpMode === m
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

        {lpMode === "real" ? (
          /* ── Real mode: Quick Targets ── */
          <div className="p-4 space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">
                Quick Targets
              </span>
              <div className="space-y-1">
                {LP_REAL_PRESETS.map((p) => (
                  <button
                    key={p.url}
                    onClick={() => !isConnected && onSelectTarget(p.url)}
                    disabled={isConnected}
                    className={`w-full text-left px-3 py-2 rounded-sm transition-colors border disabled:cursor-not-allowed ${
                      lpUrl === p.url
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
              <div className="px-3 py-2.5 rounded-sm border bg-amber-500/5 border-amber-500/10">
                <div className="text-[9px] font-body text-[#494847] leading-relaxed space-y-1.5">
                  <p>
                    <span className="text-amber-400/70 font-bold">httpbin.org/delay/N</span> holds the connection for N seconds before responding — the closest public stand-in for a real long-poll endpoint.
                  </p>
                  <p className="text-[#3a3939]">
                    The amber <span className="text-amber-400/70 font-bold">hold</span> bar shows exactly how long the server kept the connection open before replying.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Virtual mode: Event Queue ── */
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#494847]">Server Event Queue</span>
              <span className="text-[9px] font-body text-[#2e2e2e]">{firedEventIds.length}/{DEFAULT_LP_EVENTS.length} fired</span>
            </div>

            <div className="px-2 pb-2 pt-2 space-y-1.5">
              {DEFAULT_LP_EVENTS.map((evt: LongPollEvent) => {
                const fired       = firedEventIds.includes(evt.id);
                const bodyPreview = evt.body.replace(/\s+/g, " ").trim().slice(0, 55);
                return (
                  <div
                    key={evt.id}
                    className={`p-3 rounded-sm border transition-all duration-300 ${
                      fired ? "bg-amber-500/5 border-amber-500/10" : "bg-[#111] border-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${fired ? "bg-amber-400" : "bg-[#252525]"}`} />
                      <span className={`text-[9px] font-mono tabular-nums ${fired ? "text-amber-400/60" : "text-[#333]"}`}>
                        +{evt.delayMs / 1000}s
                      </span>
                      <span className={`text-[9px] font-body ${fired ? "text-[#adaaaa]" : "text-[#333]"}`}>
                        {evt.label}
                      </span>
                      {fired && (
                        <span className="ml-auto material-symbols-outlined text-amber-400/70 shrink-0" style={{ fontSize: "11px" }}>
                          check_circle
                        </span>
                      )}
                    </div>
                    <div className={`text-[9px] font-mono rounded-sm px-2 py-1.5 bg-[#0a0a0a] leading-relaxed ${fired ? "text-[#3a3939]" : "text-[#222]"}`}>
                      {bodyPreview}…
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Why it's better than short polling */}
            <div className="px-4 pb-4 pt-2 border-t border-white/5 mt-2 space-y-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#3a3939]">vs Short Polling</span>
              <div className="space-y-1.5">
                {[
                  { icon: "arrow_downward", text: "Fewer requests — server waits instead of client" },
                  { icon: "bolt",           text: "Near-zero latency when events fire" },
                  { icon: "savings",        text: "No wasted round-trips between events" },
                ].map(({ icon, text }) => (
                  <div key={icon} className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-400/40 shrink-0 mt-px" style={{ fontSize: "11px", lineHeight: 1.4 }}>{icon}</span>
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
              {sessions.slice().reverse().map((s) => {
                const timeoutRate = s.totalRounds > 0
                  ? Math.round((s.timeoutRounds / s.totalRounds) * 100)
                  : 0;
                return (
                  <div key={s.id} className="px-3 py-2 rounded-sm bg-[#1a1919] border border-transparent">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm ${
                        s.mode === "real"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-amber-500/10 text-amber-400"
                      }`}>{s.mode}</span>
                      <span className="text-[9px] font-body text-[#494847]">{s.totalRounds} rounds · {(s.timeoutMs / 1000).toFixed(0)}s timeout</span>
                      <span className="ml-auto text-[9px] font-mono text-amber-400/60">{timeoutRate}% timeout</span>
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
