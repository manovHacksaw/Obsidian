"use client";

import React from "react";
import Link from "next/link";
import type { AppMode, ViewMode } from "../types";

interface TopBarProps {
  appMode: AppMode;
  viewMode: ViewMode;
  serverRunning: boolean;
  onSetAppMode: (m: AppMode) => void;
  onSetViewMode: (v: ViewMode) => void;
  onReset: () => void;
}

export function TopBar({
  appMode,
  viewMode,
  serverRunning,
  onSetAppMode,
  onSetViewMode,
  onReset,
}: TopBarProps) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#0e0e0e]/90 backdrop-blur-xl shrink-0 z-10">
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
          HTTP Simulator
        </span>

        {/* App mode toggle */}
        <div className="flex bg-[#1a1919] rounded-sm overflow-hidden border border-white/5 ml-2">
          {(["virtual", "real"] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { onSetAppMode(m); onReset(); }}
              className={`px-4 py-1.5 text-[10px] font-bold font-body uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
                appMode === m ? "bg-[#ff8f6f] text-[#5c1400]" : "text-[#adaaaa] hover:text-white"
              }`}
            >
              <span className="material-symbols-outlined text-xs">
                {m === "virtual" ? "dns" : "travel_explore"}
              </span>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* View toggle */}
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

        {/* Status dot */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              appMode === "real" ? "bg-[#ff8f6f]" : serverRunning ? "bg-green-400" : "bg-red-500"
            }`}
            style={
              appMode === "real"
                ? { boxShadow: "0 0 6px rgba(255,143,111,0.5)" }
                : serverRunning
                ? { boxShadow: "0 0 6px rgba(74,222,128,0.5)" }
                : {}
            }
          />
          <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#777575]">
            {appMode === "real" ? "Real Network" : serverRunning ? "Server Running" : "Server Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
