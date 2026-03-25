"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SSEEvent, SSEMode, SSEConnectionStatus, SSEResponseType, SSEConnectionInfo, LifecycleStep, ReconnectResumeInfo } from "../types";
import { getEventTypeStyle } from "../constants";
import { LifecycleTimeline } from "./LifecycleTimeline";
import { HeadersPanel }      from "./HeadersPanel";

// ── Non-SSE endpoint explainer ───────────────────────────────────
// Shown when user pointed at a plain HTTP endpoint in real mode.

function NotSSECallout({ connectionInfo }: { connectionInfo: SSEConnectionInfo }) {
  return (
    <div className="mx-4 my-3 px-3 py-2.5 rounded-sm border bg-[#1a1919] border-white/[0.06]">
      <div className="flex items-start gap-2.5">
        <span className="material-symbols-outlined text-[#494847] shrink-0 mt-px" style={{ fontSize: "14px", lineHeight: 1.4 }}>
          info
        </span>
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold font-body text-[#adaaaa]">
            This is a regular HTTP endpoint, not an SSE stream
          </div>
          <div className="text-[9px] font-body text-[#494847] leading-relaxed">
            The server responded with{" "}
            <span className="text-[#777575] font-mono">{connectionInfo.httpStatus} {connectionInfo.httpStatusText}</span> and{" "}
            <span className="text-[#777575] font-mono">Content-Type: {connectionInfo.contentType || "unknown"}</span>.
            It returned a single response, then closed the connection.
          </div>
          <div className="text-[9px] font-body text-[#3a3939] leading-relaxed">
            A real SSE endpoint returns{" "}
            <span className="text-green-400/60 font-mono">Content-Type: text/event-stream</span> and keeps
            the connection open — pushing <span className="font-mono">data: …</span> frames as events fire.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Event type badge ─────────────────────────────────────────────

function EventTypeBadge({ eventType }: { eventType: string }) {
  const s = getEventTypeStyle(eventType);
  return (
    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 ${s.bg} ${s.text}`}
      style={{ letterSpacing: "0.08em" }}>
      {eventType}
    </span>
  );
}

// ── Event row ────────────────────────────────────────────────────

function SSEEventRow({
  event,
  isSelected,
  isHttp,
  onClick,
}: {
  event:      SSEEvent;
  isSelected: boolean;
  isHttp:     boolean;
  onClick:    () => void;
}) {
  const preview = event.data.replace(/\s+/g, " ").trim();
  const short   = preview.length > 64 ? preview.slice(0, 64) + "…" : preview;
  const isReplay = event.isReplay === true;
  // Replay events use a yellow/amber accent to distinguish them from initial-session events
  const accentColor = isReplay
    ? "border-l-yellow-400/20 bg-yellow-400/[0.01]"
    : isHttp ? "border-l-[#494847]/30 bg-[#111]" : "border-l-green-500/15 bg-green-500/[0.015]";
  const accentSelected = isReplay
    ? "border-l-yellow-400/40 bg-yellow-400/[0.04]"
    : isHttp ? "border-l-[#adaaaa]/30 bg-[#1a1919]" : "border-l-green-500/40 bg-green-500/[0.06]";

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-3 px-4 py-[7px] border-b border-white/[0.03] cursor-pointer transition-colors border-l-2 pl-[14px] ${
        isSelected ? accentSelected : `${accentColor} hover:bg-white/[0.02]`
      }`}
    >
      <span className="text-[9px] font-mono shrink-0 w-5 text-right tabular-nums text-[#555350]">
        #{event.index + 1}
      </span>

      <EventTypeBadge eventType={event.eventType} />

      <span className="text-[9px] font-mono flex-1 truncate text-[#4a4846]">
        {short}
      </span>

      <span className={`text-[9px] font-mono shrink-0 tabular-nums ${isReplay ? "text-yellow-400/40" : isHttp ? "text-[#494847]" : "text-green-400/50"}`}>
        +{event.elapsedMs}ms
      </span>

      {!isSelected && (
        <span className="material-symbols-outlined text-[#2e2e2e] group-hover:text-[#494847] transition-colors shrink-0" style={{ fontSize: "11px" }}>
          chevron_right
        </span>
      )}
      {isSelected && (
        <span className={`material-symbols-outlined shrink-0 ${isHttp ? "text-[#777575]/50" : "text-green-400/50"}`} style={{ fontSize: "11px" }}>
          arrow_right
        </span>
      )}
    </div>
  );
}

// ── Reconnect separator ─────────────────────────────────────────
// Shown in the event list at the boundary between pre-disconnect and post-reconnect events.

function ReconnectSeparator({ info }: { info: ReconnectResumeInfo }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.03] bg-yellow-400/[0.025]">
      <span className="material-symbols-outlined text-yellow-400/60 shrink-0" style={{ fontSize: "11px", lineHeight: 1 }}>
        restart_alt
      </span>
      <span className="text-[9px] font-mono text-yellow-400/70 flex-1">
        Reconnected — Last-Event-ID: <span className="text-yellow-300/80">{info.lastEventId}</span>
        <span className="text-yellow-400/40 ml-2">
          · {info.skippedCount} event{info.skippedCount !== 1 ? "s" : ""} skipped (already delivered)
          {info.resumingFromId ? ` · resuming from ${info.resumingFromId}` : ""}
        </span>
      </span>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────

interface SSEPanelProps {
  sseMode:              SSEMode;
  sseUrl:               string;
  onSetSseUrl:          (u: string) => void;
  events:               SSEEvent[];
  connectionStatus:     SSEConnectionStatus;
  connectMs:            number | null;
  streamElapsedMs:      number;
  responseType:         SSEResponseType;
  connectionInfo:       SSEConnectionInfo | null;
  lifecycleSteps:       LifecycleStep[];
  responseHeaders:      Record<string, string>;
  selectedEventIdx:     number | null;
  reconnectLastEventId: string | null;
  reconnectInfo:        ReconnectResumeInfo | null;
  onConnect:            () => void;
  onDisconnect:         () => void;
  onReset:              () => void;
  onSelectEvent:        (idx: number | null) => void;
  onReconnect:          (lastEventId: string) => void;
}

// ── Component ────────────────────────────────────────────────────

export function SSEPanel({
  sseMode,
  sseUrl,
  onSetSseUrl,
  events,
  connectionStatus,
  connectMs,
  streamElapsedMs,
  responseType,
  connectionInfo,
  lifecycleSteps,
  responseHeaders,
  selectedEventIdx,
  reconnectLastEventId,
  reconnectInfo,
  onConnect,
  onDisconnect,
  onReset,
  onSelectEvent,
  onReconnect,
}: SSEPanelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"events" | "headers">("events");

  // Reset to Events tab when connection resets
  useEffect(() => {
    if (connectionStatus === "idle") setActiveTab("events");
  }, [connectionStatus]);

  const isStreaming  = connectionStatus === "streaming" || connectionStatus === "connecting";
  const isDone       = !isStreaming && events.length > 0;
  const isHttp       = responseType === "http";
  const hasHeaders   = Object.keys(responseHeaders).length > 0;

  const urlError = sseMode === "real" && !sseUrl.trim()
    ? "URL required"
    : sseMode === "real" && (() => { try { new URL(sseUrl); return false; } catch { return true; } })()
      ? "Enter a valid URL"
      : null;

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length, streamElapsedMs]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Request bar ── */}
      <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] px-4 pt-4 pb-3 space-y-2.5">

        {/* Row 1: input + connect button */}
        <div className={`flex items-stretch rounded-sm border overflow-hidden transition-colors duration-150 ${
          urlError ? "border-red-500/25" : "border-white/8 focus-within:border-white/16"
        }`}>
          {sseMode === "real" ? (
            <input
              value={sseUrl}
              onChange={(e) => onSetSseUrl(e.target.value)}
              disabled={isStreaming}
              placeholder="https://api.example.com/events"
              className="flex-1 bg-[#0d0d0d] text-white text-sm font-mono px-4 py-3 focus:outline-none min-w-0 placeholder:text-[#2e2e2e] disabled:opacity-50"
            />
          ) : (
            <div className="flex items-center gap-2 px-4 flex-1 bg-[#0d0d0d]">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
              <span className="text-[10px] font-bold font-body uppercase tracking-widest text-[#494847]">Virtual</span>
              <span className="text-[9px] font-body text-[#2e2e2e] ml-1">— events fire from the left panel stream</span>
            </div>
          )}

          <div className="w-px bg-white/8 shrink-0" />

          {isStreaming ? (
            <button
              onClick={onDisconnect}
              className="px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 bg-red-500/10 text-red-400 hover:bg-red-500/20"
            >
              <span className="material-symbols-outlined text-base">stop_circle</span>
              Disconnect
            </button>
          ) : (
            <button
              onClick={urlError ? undefined : onConnect}
              disabled={!!urlError}
              title={urlError ?? undefined}
              className={`px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 ${
                urlError
                  ? "bg-[#1a1919] text-[#3a3939] cursor-not-allowed"
                  : "bg-[#ff8f6f] text-[#5c1400] hover:bg-[#ff7851] active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              }`}
            >
              <span className="material-symbols-outlined text-base">stream</span>
              Connect
            </button>
          )}
        </div>

        {/* Row 2: lifecycle timeline + reset */}
        <div className="flex items-start gap-4 px-1 min-h-[26px]">
          {lifecycleSteps.length > 0 ? (
            <LifecycleTimeline steps={lifecycleSteps} />
          ) : (
            <span className="text-[9px] font-body text-[#252525] mt-1">
              {sseMode === "real"
                ? "Connect to see whether this endpoint streams or responds once"
                : "Connect to open a persistent stream — one connection, multiple events"}
            </span>
          )}
          <div className="flex-1" />
          {isDone && (
            <button onClick={onReset} className="text-[9px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-1 shrink-0 mt-1">
              <span className="material-symbols-outlined" style={{ fontSize: "12px", lineHeight: 1 }}>refresh</span>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Real-mode protocol transparency callout ── */}
      {sseMode === "real" && lifecycleSteps.some((s) => s.id === "connect" && s.status === "done") && (
        <div className="mx-4 mt-2 mb-1 px-3 py-2 rounded-sm border border-white/[0.04] bg-[#0f0f0f]">
          <p className="text-[9px] font-body text-[#3a3939] leading-relaxed">
            <span className="text-[#494847]">Connect phase</span> bundles DNS + TCP + TLS + HTTP request into one timing —
            Node.js <span className="font-mono text-[#333]">fetch()</span> does not expose individual steps.
            To see each layer separately, use the{" "}
            <a href="/simulate/http" className="text-[#ff8f6f]/50 hover:text-[#ff8f6f]/80 underline underline-offset-2 transition-colors">
              HTTP Lifecycle simulator
            </a>.
          </p>
        </div>
      )}

      {/* ── Non-SSE callout ── */}
      <AnimatePresence>
        {isHttp && connectionInfo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden shrink-0"
          >
            <NotSSECallout connectionInfo={connectionInfo} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stats bar ── */}
      <AnimatePresence>
        {events.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden shrink-0"
          >
            <div className="border-b border-white/5 bg-[#0c0c0c] px-4 py-2.5">
              <div className="flex items-center gap-3">
                {isHttp ? (
                  <>
                    <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-[#494847]/15 text-[#777575] uppercase tracking-[0.12em]">HTTP</span>
                    <span className="text-[11px] font-bold font-mono text-[#adaaaa] tabular-nums">{connectionInfo?.httpStatus ?? "—"}</span>
                    <span className="text-[9px] font-body text-[#3a3939]">{connectionInfo?.httpStatusText}</span>
                    <span className="text-[#1e1e1e]">·</span>
                    <span className="text-[9px] font-body text-[#3a3939]">single response</span>
                    <span className="text-[9px] font-body text-[#3a3939]">·</span>
                    <span className="text-[11px] font-bold font-mono text-white tabular-nums">{connectMs ?? "—"}ms</span>
                    <span className="text-[9px] font-body text-[#3a3939]">connect</span>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-green-500/10 text-green-400 uppercase tracking-[0.12em]">SSE</span>
                    <span className="text-[11px] font-bold font-mono text-green-400 tabular-nums">{events.length}</span>
                    <span className="text-[9px] font-body text-[#3a3939]">events</span>
                    <span className="text-[#1e1e1e]">·</span>
                    <span className="text-[11px] font-bold font-mono text-white tabular-nums">{connectMs ?? "—"}ms</span>
                    <span className="text-[9px] font-body text-[#3a3939]">connect</span>
                    {events.length > 0 && (
                      <>
                        <span className="text-[#1e1e1e]">·</span>
                        <span className="text-[9px] font-body text-[#2e2e2e]">last at</span>
                        <span className="text-[11px] font-bold font-mono text-green-400/60 tabular-nums">
                          +{events[events.length - 1].elapsedMs}ms
                        </span>
                      </>
                    )}
                  </>
                )}
                <div className="flex-1" />
                <span className="text-[9px] font-bold font-mono tabular-nums text-[#494847]">
                  {(streamElapsedMs / 1000).toFixed(1)}s open
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tab nav: Events | Headers ── */}
      {(events.length > 0 || hasHeaders) && (
        <div className="flex items-center border-b border-white/5 shrink-0">
          {[
            { id: "events",  label: "Events",  count: events.length > 0 ? events.length : undefined },
            { id: "headers", label: "Headers",  count: undefined },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "events" | "headers")}
              className={`px-4 py-2 text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-white border-[#ff8f6f]"
                  : "text-[#333] border-transparent hover:text-[#777575]"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-[8px] font-mono text-[#494847] tabular-nums">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Column headers (Events tab only) ── */}
      {activeTab === "events" && events.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/[0.03] shrink-0">
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] w-5 text-right">#</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] w-20">{isHttp ? "Type" : "Event"}</span>
          <span className="text-[8px] font-bold font-body uppercase tracking-[0.15em] text-[#222] flex-1">{isHttp ? "Body" : "Data"}</span>
          <span className={`text-[8px] font-bold font-body uppercase tracking-[0.15em] ${isHttp ? "text-[#333]" : "text-green-500/40"}`}>
            {isHttp ? "Time" : "Elapsed"}
          </span>
          <span className="w-3" />
        </div>
      )}

      {/* ── Headers tab ── */}
      {activeTab === "headers" && (
        <div className="flex-1 overflow-hidden min-h-0">
          <HeadersPanel responseHeaders={responseHeaders} mode={sseMode} />
        </div>
      )}

      {/* ── Events tab / Timeline ── */}
      <div className={`flex-1 overflow-y-auto min-h-0 ${activeTab !== "events" ? "hidden" : ""}`}>

        {/* Empty state: idle */}
        {events.length === 0 && connectionStatus === "idle" && (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
            <div className="w-16 h-16 bg-[#1a1919] border border-white/8 rounded-sm flex items-center justify-center">
              <span className="material-symbols-outlined text-green-400/30 text-3xl">stream</span>
            </div>
            <div>
              <p className="text-sm font-headline font-bold text-[#494847] mb-2">
                {sseMode === "real" ? "Enter a URL and connect" : "No events yet"}
              </p>
              <p className="text-[10px] font-body text-[#3a3939] leading-relaxed max-w-72">
                {sseMode === "real"
                  ? "Try any URL — SSE endpoint or plain API. The simulator auto-detects whether the server streams or responds once, and visualizes the difference."
                  : "Connect and watch a live notification stream. One HTTP connection carries all events — that's SSE."}
              </p>
            </div>
          </div>
        )}

        {/* Connecting state */}
        {events.length === 0 && connectionStatus === "connecting" && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-[10px] font-mono text-blue-400/50"
            >
              Establishing connection…
            </motion.div>
          </div>
        )}

        {/* SSE: waiting for first event after connect */}
        {events.length === 0 && connectionStatus === "streaming" && !isHttp && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="w-12 h-12 bg-green-500/5 border border-green-500/10 rounded-sm flex items-center justify-center">
              <motion.span
                className="material-symbols-outlined text-green-400/40 text-2xl"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                stream
              </motion.span>
            </div>
            <div>
              <p className="text-sm font-headline font-bold text-[#494847] mb-1">Connected. Waiting for events…</p>
              <p className="text-[10px] font-body text-[#3a3939] leading-relaxed max-w-64">
                The connection is open. The server will push events as they happen.
              </p>
            </div>
          </div>
        )}

        {/* HTTP: waiting for response (streaming state but no events yet) */}
        {events.length === 0 && connectionStatus === "streaming" && isHttp && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.7 }}
              className="text-[10px] font-mono text-[#494847]"
            >
              Reading response body…
            </motion.div>
          </div>
        )}

        {/* Completed events — with reconnect separator injected at replay boundary */}
        {events.map((event) => (
          <motion.div
            key={event.index}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {/* Insert separator before the first replay event */}
            {event.isReplay && reconnectInfo && event.index === events.findIndex((e) => e.isReplay) && (
              <ReconnectSeparator info={reconnectInfo} />
            )}
            <SSEEventRow
              event={event}
              isSelected={selectedEventIdx === event.index}
              isHttp={isHttp}
              onClick={() => onSelectEvent(selectedEventIdx === event.index ? null : event.index)}
            />
          </motion.div>
        ))}

        {/* SSE streaming: waiting cursor */}
        {connectionStatus === "streaming" && !isHttp && events.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-[7px] border-b border-white/[0.03] border-l-2 border-l-green-500/10">
            <span className="w-5" />
            <motion.span
              className="text-[9px] font-mono text-green-400/25"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.1 }}
            >
              Waiting for next event…
            </motion.span>
          </div>
        )}

        {/* HTTP done: explanation */}
        {isHttp && isDone && (
          <div className="mx-4 my-3 px-3 py-2 rounded-sm bg-[#0f0f0f] border border-white/[0.04]">
            <p className="text-[9px] font-body text-[#3a3939] leading-relaxed">
              <span className="text-[#494847]">Server closed the connection after sending the full response.</span>{" "}
              This is normal HTTP behavior — one request, one response, connection closed.
              A real SSE endpoint would keep this open and push more frames.
            </p>
          </div>
        )}

        {/* SSE done hint */}
        {!isHttp && isDone && selectedEventIdx === null && (
          <div className="px-4 py-3 text-center">
            <span className="text-[9px] font-body text-[#2e2e2e]">
              Click any event row to inspect its data →
            </span>
          </div>
        )}

        {/* Reconnect button — shown in virtual mode after disconnect when there's a lastEventId */}
        {sseMode === "virtual" && connectionStatus === "closed" && reconnectLastEventId && (
          <div className="px-4 py-4 flex flex-col items-center gap-3 border-t border-white/[0.03]">
            <div className="text-center space-y-1">
              <p className="text-[10px] font-bold font-body text-[#adaaaa]">
                Browser auto-reconnects with Last-Event-ID
              </p>
              <p className="text-[9px] font-body text-[#3a3939] max-w-xs leading-relaxed">
                The browser sends <span className="font-mono text-yellow-400/70">Last-Event-ID: {reconnectLastEventId}</span> in the new request.
                The server skips already-delivered events and resumes the stream from where you left off.
              </p>
            </div>
            <button
              onClick={() => onReconnect(reconnectLastEventId)}
              className="flex items-center gap-2 px-4 py-2 rounded-sm border border-yellow-400/20 bg-yellow-400/[0.04] hover:bg-yellow-400/[0.08] text-yellow-400/80 hover:text-yellow-300 transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px", lineHeight: 1 }}>restart_alt</span>
              <span className="text-[10px] font-bold font-body">Reconnect (Last-Event-ID: {reconnectLastEventId})</span>
            </button>
          </div>
        )}

        <div ref={sentinelRef} />
      </div>
    </div>
  );
}
