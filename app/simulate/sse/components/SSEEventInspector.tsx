"use client";

import type { SSEEvent } from "../types";
import { getEventTypeStyle } from "../constants";

interface SSEEventInspectorProps {
  event:                  SSEEvent;
  rightWidth:             number;
  onDragHandleMouseDown:  (e: React.MouseEvent) => void;
  onClose:                () => void;
}

function tryFormatJson(raw: string): { formatted: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(raw);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: raw, isJson: false };
  }
}

export function SSEEventInspector({
  event,
  rightWidth,
  onDragHandleMouseDown,
  onClose,
}: SSEEventInspectorProps) {
  const style                     = getEventTypeStyle(event.eventType);
  const { formatted, isJson }     = tryFormatJson(event.data);
  const receivedTime              = new Date(event.receivedAt).toLocaleTimeString();

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
        <span className="material-symbols-outlined text-green-400/70 text-base">code</span>
        <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">
          Event Inspector
        </span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="p-1 rounded-sm text-[#777575] hover:text-white hover:bg-[#1a1919] transition-colors"
          title="Close"
          aria-label="Close event inspector"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px", lineHeight: 1 }}>close</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

        {/* Event meta */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
            Event Metadata
          </span>
          <div className="space-y-1.5">

            <div className="flex items-center justify-between px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
              <span className="text-[9px] font-body text-[#494847]">event:</span>
              <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
                style={{ letterSpacing: "0.08em" }}>
                {event.eventType}
              </span>
            </div>

            {event.id && (
              <div className="flex items-center justify-between px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
                <span className="text-[9px] font-body text-[#494847]">id:</span>
                <span className="text-[9px] font-mono text-[#adaaaa]">{event.id}</span>
              </div>
            )}

            <div className="flex items-center justify-between px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
              <span className="text-[9px] font-body text-[#494847]">elapsed:</span>
              <span className="text-[9px] font-mono text-green-400/70 tabular-nums">+{event.elapsedMs}ms</span>
            </div>

            <div className="flex items-center justify-between px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
              <span className="text-[9px] font-body text-[#494847]">received at:</span>
              <span className="text-[9px] font-mono text-[#494847]">{receivedTime}</span>
            </div>

            <div className="flex items-center justify-between px-3 py-2 bg-[#111] border border-white/[0.04] rounded-sm">
              <span className="text-[9px] font-body text-[#494847]">index:</span>
              <span className="text-[9px] font-mono text-[#555350] tabular-nums">#{event.index + 1}</span>
            </div>

          </div>
        </div>

        {/* Raw SSE frame */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939] block">
            Wire Format
          </span>
          <div className="px-3 py-2.5 bg-[#0a0a0a] border border-white/[0.04] rounded-sm font-mono text-[9px] leading-relaxed text-[#494847] space-y-0.5">
            {event.id && (
              <div><span className="text-green-400/40">id:</span> {event.id}</div>
            )}
            <div><span className="text-green-400/40">event:</span> {event.eventType}</div>
            <div><span className="text-green-400/40">data:</span> {event.data.replace(/\n/g, "↵ ")}</div>
            <div className="text-[#222]">(empty line)</div>
          </div>
        </div>

        {/* Data payload */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939]">
              data:
            </span>
            {isJson && (
              <span className="text-[8px] font-bold font-body uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-sm bg-green-500/10 text-green-400/70">
                JSON
              </span>
            )}
          </div>
          <pre className="px-3 py-2.5 bg-[#0a0a0a] border border-white/[0.04] rounded-sm font-mono text-[9px] leading-relaxed text-[#555350] whitespace-pre-wrap break-words overflow-x-auto">
            {formatted}
          </pre>
        </div>

      </div>
    </div>
  );
}
