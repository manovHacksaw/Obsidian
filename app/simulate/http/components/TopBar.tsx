"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppMode, PollMode, ProtocolMode, ViewMode } from "../types";

interface ProgressionItem {
  id: ProtocolMode;
  label: string;
  available: boolean;
}

const ITEMS: ProgressionItem[] = [
  { id: "http",       label: "HTTP",       available: true  },
  { id: "polling",    label: "Polling",    available: true  },
  { id: "long-poll",  label: "Long Poll",  available: true  },
  { id: "websocket",  label: "WebSocket",  available: false },
  { id: "heartbeat",  label: "Heartbeat",  available: false },
];

function toProtocolMode(appMode: AppMode): ProtocolMode {
  if (appMode === "polling") return "polling";
  return "http";
}

interface TopBarProps {
  appMode: AppMode;
  pollMode?: PollMode;
  viewMode: ViewMode;
  serverRunning: boolean;
  onSetAppMode: (m: AppMode) => void;
  onSetViewMode: (v: ViewMode) => void;
  onReset: () => void;
  onNavigateProtocol: (mode: ProtocolMode) => void;
}

export function TopBar({
  appMode,
  pollMode,
  viewMode,
  serverRunning,
  onSetAppMode,
  onSetViewMode,
  onReset,
  onNavigateProtocol,
}: TopBarProps) {
  const router    = useRouter();
  const isPolling = appMode === "polling";
  const current   = toProtocolMode(appMode);

  // ── Visited state (localStorage) ──
  const [visited, setVisited] = useState<Set<ProtocolMode>>(() => {
    if (typeof window === "undefined") return new Set(["http"]);
    try {
      const stored = localStorage.getItem("obsidian_visited_modes");
      return stored ? new Set(JSON.parse(stored) as ProtocolMode[]) : new Set(["http"]);
    } catch {
      return new Set(["http"]);
    }
  });

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(current)) return prev;
      const next = new Set([...prev, current]);
      try { localStorage.setItem("obsidian_visited_modes", JSON.stringify([...next])); } catch { /* no-op */ }
      return next;
    });
  }, [current]);

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
          {isPolling ? "Polling" : "HTTP"}
        </span>
      </div>

      {/* ── Center: progression trail ── */}
      <div className="flex items-center justify-center gap-0">
        {ITEMS.map((item, i) => {
          const isCurrent   = item.id === current;
          const isVisited   = visited.has(item.id);
          const isClickable = item.available;

          return (
            <React.Fragment key={item.id}>
              {/* Connector */}
              {i > 0 && (
                <div className={`w-6 h-px shrink-0 ${
                  isVisited || ITEMS[i - 1].id === current ? "bg-[#ff8f6f]/25" : "bg-white/[0.06]"
                }`} />
              )}

              {/* Node */}
              <button
                onClick={() => {
                  if (!isClickable) return;
                  if (item.id === "long-poll") { router.push("/simulate/long-poll"); return; }
                  onNavigateProtocol(item.id);
                }}
                disabled={!isClickable}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-sm transition-all duration-200 ${
                  isClickable ? "cursor-pointer hover:opacity-100" : "cursor-default"
                }`}
              >
                <span className={`relative flex items-center justify-center w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200 ${
                  isCurrent  ? "bg-[#ff8f6f]"
                  : isVisited ? "bg-[#ff8f6f]/40"
                  : "border border-white/20 bg-transparent"
                }`}>
                  {isCurrent && (
                    <span className="absolute inset-0 rounded-full bg-[#ff8f6f] animate-ping opacity-40" />
                  )}
                </span>
                <span className={`text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-colors duration-200 ${
                  isCurrent  ? "text-[#ff8f6f]"
                  : isVisited ? "text-[#adaaaa]"
                  : "text-white/20"
                }`}>
                  {item.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Right: view tools + status ── */}
      <div className="flex items-center gap-4 justify-end">
        {/* View toggle — hidden in polling mode */}
        {!isPolling && (
          <div className="flex bg-[#1a1919] rounded-sm overflow-hidden border border-white/5">
            {(["visual", "raw"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => onSetViewMode(v)}
                className={`px-3 py-1.5 text-[10px] font-bold font-body uppercase tracking-widest transition-colors ${
                  viewMode === v ? "bg-[#ff8f6f] text-[#5c1400]" : "text-[#adaaaa] hover:text-white"
                }`}
              >
                {v === "visual" ? "Visual" : "Raw HTTP"}
              </button>
            ))}
          </div>
        )}

        {/* Status dot */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPolling && pollMode === "real" ? "bg-[#ff8f6f]"  :
              isPolling                        ? "bg-blue-400"   :
              appMode === "real"               ? "bg-[#ff8f6f]"  :
              serverRunning                    ? "bg-green-400"  : "bg-red-500"
            }`}
            style={
              (isPolling && pollMode === "real") || appMode === "real" ? { boxShadow: "0 0 6px rgba(255,143,111,0.5)" } :
              isPolling                                                 ? { boxShadow: "0 0 6px rgba(96,165,250,0.5)"  } :
              serverRunning                                             ? { boxShadow: "0 0 6px rgba(74,222,128,0.5)"  } : {}
            }
          />
          <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#777575]">
            {isPolling && pollMode === "real" ? "Real Network" :
             isPolling                        ? "Simulated"    :
             appMode === "real"               ? "Real Network" :
             serverRunning                    ? "Server Running" : "Server Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
