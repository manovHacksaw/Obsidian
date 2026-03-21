"use client";

import { SSE_REQUEST_HEADERS, HEADER_ANNOTATIONS } from "../constants";

// ── Header row ───────────────────────────────────────────────────

function HeaderRow({ name, value }: { name: string; value: string }) {
  const annotation = HEADER_ANNOTATIONS[name.toLowerCase()];
  const isKey      = annotation?.importance === "key";
  const isDim      = annotation?.importance === "dim";

  return (
    <div className={`px-3 py-2 border-b border-white/[0.03] last:border-b-0 ${isKey ? "bg-white/[0.015]" : ""}`}>
      <div className="flex items-start gap-2 min-w-0">
        <span className={`text-[9px] font-mono shrink-0 ${
          isKey ? "text-[#ff8f6f]/70" : isDim ? "text-[#3a3939]" : "text-[#494847]"
        }`}>
          {name}:
        </span>
        <span className={`text-[9px] font-mono break-all ${
          isKey ? "text-white/80" : isDim ? "text-[#2e2e2e]" : "text-[#777575]"
        }`}>
          {value}
        </span>
      </div>
      {annotation && !isDim && (
        <p className="text-[8px] font-body text-[#2e2e2e] mt-1 leading-relaxed pl-0">
          {annotation.note}
        </p>
      )}
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────

function HeaderSection({
  title,
  badge,
  headers,
  emptyHint,
}: {
  title:     string;
  badge?:    string;
  headers:   Record<string, string>;
  emptyHint: string;
}) {
  const entries = Object.entries(headers);
  return (
    <div className="flex flex-col min-h-0">
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0a0a0a] shrink-0">
        <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#3a3939]">{title}</span>
        {badge && (
          <span className="text-[8px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-[#ff8f6f]/10 text-[#ff8f6f]/70 uppercase tracking-[0.1em]">
            {badge}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[8px] font-mono text-[#2e2e2e] tabular-nums">{entries.length} headers</span>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {entries.length === 0 ? (
          <div className="px-3 py-4">
            <p className="text-[9px] font-body text-[#252525] leading-relaxed">{emptyHint}</p>
          </div>
        ) : (
          entries.map(([k, v]) => <HeaderRow key={k} name={k} value={v} />)
        )}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────

interface HeadersPanelProps {
  responseHeaders: Record<string, string>;
  mode:            "virtual" | "real";
}

export function HeadersPanel({ responseHeaders, mode }: HeadersPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Intro */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <p className="text-[9px] font-body text-[#3a3939] leading-relaxed">
          Headers are metadata exchanged at the start of every HTTP request. For SSE,{" "}
          <span className="text-[#ff8f6f]/60 font-mono">Accept: text/event-stream</span> and{" "}
          <span className="text-[#ff8f6f]/60 font-mono">Content-Type: text/event-stream</span> are the key signals that open a persistent stream.
          {mode === "virtual" && (
            <span className="text-[#2e2e2e]"> (Response headers are simulated for the virtual session.)</span>
          )}
        </p>
      </div>

      {/* Two header sections */}
      <div className="flex-1 overflow-hidden grid grid-rows-2 min-h-0">
        <HeaderSection
          title="Request"
          badge="sent"
          headers={SSE_REQUEST_HEADERS}
          emptyHint="No request headers captured."
        />
        <div className="border-t border-white/5" />
        <HeaderSection
          title="Response"
          badge={mode === "virtual" ? "simulated" : "received"}
          headers={responseHeaders}
          emptyHint="Response headers will appear here after the connection is established."
        />
      </div>
    </div>
  );
}
