"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SSEConnectionStatus, SSEResponseType } from "../types";

type ProtocolId = "http" | "polling" | "long-poll" | "sse" | "websocket";

const ITEMS: { id: ProtocolId; label: string; available: boolean; href: string }[] = [
  { id: "http",      label: "HTTP",      available: true,  href: "/simulate/http"      },
  { id: "polling",   label: "Polling",   available: true,  href: "/simulate/http"      },
  { id: "long-poll", label: "Long Poll", available: true,  href: "/simulate/long-poll" },
  { id: "sse",       label: "SSE",       available: true,  href: "/simulate/sse"       },
  { id: "websocket", label: "WebSocket", available: false, href: "#"                   },
];

interface SSETopBarProps {
  connectionStatus: SSEConnectionStatus;
  responseType:     SSEResponseType;
}

export function SSETopBar({ connectionStatus, responseType }: SSETopBarProps) {
  const router  = useRouter();
  const current: ProtocolId = "sse";

  const [visited, setVisited] = useState<Set<ProtocolId>>(() => {
    if (typeof window === "undefined") return new Set(["http", "polling", "long-poll", "sse"]);
    try {
      const stored = localStorage.getItem("obsidian_visited_modes");
      const parsed: ProtocolId[] = stored ? JSON.parse(stored) : [];
      return new Set([...parsed, "sse"]);
    } catch {
      return new Set(["http", "polling", "long-poll", "sse"]);
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

  const dotColor =
    connectionStatus === "streaming"   ? "bg-green-400"
    : connectionStatus === "connecting" ? "bg-blue-400"
    : connectionStatus === "error"      ? "bg-red-400"
    : "bg-[#494847]";

  const dotGlow: React.CSSProperties =
    connectionStatus === "streaming"
      ? { boxShadow: "0 0 6px rgba(74,222,128,0.5)" }
      : connectionStatus === "connecting"
        ? { boxShadow: "0 0 6px rgba(96,165,250,0.5)" }
        : {};

  const statusLabel =
    connectionStatus === "streaming"   ? "Streaming"
    : connectionStatus === "connecting" ? "Connecting"
    : connectionStatus === "closed"     ? "Closed"
    : connectionStatus === "error"      ? "Error"
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
          SSE
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

      {/* Right: response type badge + status dot */}
      <div className="flex items-center gap-4 justify-end">
        {responseType !== null && (
          <span className={`text-[9px] font-bold font-body px-2 py-1 rounded-sm uppercase tracking-[0.15em] ${
            responseType === "sse"
              ? "bg-green-500/10 text-green-400"
              : "bg-[#494847]/20 text-[#adaaaa]"
          }`}>
            {responseType === "sse" ? "Stream" : "Single Response"}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${dotColor} ${connectionStatus === "streaming" ? "animate-pulse" : ""}`}
            style={dotGlow}
          />
          <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#777575]">
            {statusLabel}
          </span>
        </div>
      </div>

    </header>
  );
}
