"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LongPollRoundStatus } from "../types";

type ProtocolId = "http" | "polling" | "long-poll" | "websocket" | "heartbeat";

const ITEMS: { id: ProtocolId; label: string; available: boolean; href: string }[] = [
  { id: "http",      label: "HTTP",      available: true,  href: "/simulate/http" },
  { id: "polling",   label: "Polling",   available: true,  href: "/simulate/http" },
  { id: "long-poll", label: "Long Poll", available: true,  href: "/simulate/long-poll" },
  { id: "websocket", label: "WebSocket", available: false, href: "#" },
  { id: "heartbeat", label: "Heartbeat", available: false, href: "#" },
];

interface LongPollTopBarProps {
  isConnected:   boolean;
  activeStatus:  LongPollRoundStatus | "holding" | null;
}

export function LongPollTopBar({ isConnected, activeStatus }: LongPollTopBarProps) {
  const router = useRouter();
  const current: ProtocolId = "long-poll";

  const [visited, setVisited] = useState<Set<ProtocolId>>(() => {
    if (typeof window === "undefined") return new Set(["http", "polling", "long-poll"]);
    try {
      const stored = localStorage.getItem("obsidian_visited_modes");
      const parsed: ProtocolId[] = stored ? JSON.parse(stored) : [];
      return new Set([...parsed, "long-poll"]);
    } catch {
      return new Set(["http", "polling", "long-poll"]);
    }
  });

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(current)) return prev;
      const next = new Set([...prev, current]);
      try { localStorage.setItem("obsidian_visited_modes", JSON.stringify([...next])); } catch { /* no-op */ }
      return next;
    });
  }, []);

  const dotColor = activeStatus === "holding"
    ? "bg-amber-400"
    : isConnected
      ? "bg-amber-400"
      : "bg-[#494847]";

  const dotGlow = activeStatus === "holding" || isConnected
    ? { boxShadow: "0 0 6px rgba(251,191,36,0.5)" }
    : {};

  const statusLabel = activeStatus === "holding"
    ? "Holding"
    : isConnected
      ? "Connected"
      : "Idle";

  return (
    <header className="grid grid-cols-3 items-center px-6 py-3 border-b border-white/5 bg-[#0e0e0e]/90 backdrop-blur-xl shrink-0 z-10">

      {/* Left: identity */}
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
          Long Poll
        </span>
      </div>

      {/* Center: progression trail */}
      <div className="flex items-center justify-center gap-0">
        {ITEMS.map((item, i) => {
          const isCurrent   = item.id === current;
          const isVisited   = visited.has(item.id);
          const isClickable = item.available;

          return (
            <React.Fragment key={item.id}>
              {i > 0 && (
                <div className={`w-6 h-px shrink-0 ${
                  isVisited || ITEMS[i - 1].id === current ? "bg-[#ff8f6f]/25" : "bg-white/[0.06]"
                }`} />
              )}
              <button
                onClick={() => { if (isClickable && !isCurrent) router.push(item.href); }}
                disabled={!isClickable}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-sm transition-all duration-200 ${
                  isClickable ? "cursor-pointer hover:opacity-100" : "cursor-default"
                }`}
              >
                <span className={`relative flex items-center justify-center w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-200 ${
                  isCurrent   ? "bg-[#ff8f6f]"
                  : isVisited ? "bg-[#ff8f6f]/40"
                  : "border border-white/20 bg-transparent"
                }`}>
                  {isCurrent && (
                    <span className="absolute inset-0 rounded-full bg-[#ff8f6f] animate-ping opacity-40" />
                  )}
                </span>
                <span className={`text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-colors duration-200 ${
                  isCurrent   ? "text-[#ff8f6f]"
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

      {/* Right: status dot */}
      <div className="flex items-center gap-4 justify-end">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} style={dotGlow} />
          <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#777575]">
            {statusLabel}
          </span>
        </div>
      </div>

    </header>
  );
}
