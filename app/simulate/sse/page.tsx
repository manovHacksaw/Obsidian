"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SSEMode, SSEConnectionStatus, SSEEvent, SSESession, SSEResponseType, SSEConnectionInfo, LifecycleStep, LifecycleStepStatus, ReconnectResumeInfo } from "./types";
import { uid } from "./constants";
import { SSETopBar }          from "./components/SSETopBar";
import { SSELeftPanel }       from "./components/SSELeftPanel";
import { SSEPanel }           from "./components/SSEPanel";
import { SSEAnalysis }        from "./components/SSEAnalysis";
import { SSEEventInspector }  from "./components/SSEEventInspector";

// ── SSE reader helper (same pattern as long-poll) ────────────────

async function* readSSE(res: Response, signal: AbortSignal) {
  const reader  = res.body!.getReader();
  const decoder = new TextDecoder();
  let   buffer  = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { yield JSON.parse(line.slice(6)) as Record<string, unknown>; }
        catch { /* malformed line */ }
      }
    }
  } finally {
    reader.cancel();
  }
}

// ── Page ─────────────────────────────────────────────────────────

export default function SSEPage() {

  // ── Config ──
  const [sseMode,   setSseMode]   = useState<SSEMode>("virtual");
  const [sseUrl,    setSseUrl]    = useState("https://stream.wikimedia.org/v2/stream/page-create");
  const [timeoutMs, setTimeoutMs] = useState(30000);

  // ── Live state ──
  const [connectionStatus, setConnectionStatus] = useState<SSEConnectionStatus>("idle");
  const [connectMs,        setConnectMs]        = useState<number | null>(null);
  const [streamElapsedMs,  setStreamElapsedMs]  = useState(0);
  const [events,           setEvents]           = useState<SSEEvent[]>([]);
  const [selectedEventIdx, setSelectedEventIdx] = useState<number | null>(null);

  // ── Response type detection ──
  // Virtual mode is always "sse". Real mode can be "sse" | "http" depending on Content-Type.
  const [responseType,    setResponseType]    = useState<SSEResponseType>(null);
  const [connectionInfo,  setConnectionInfo]  = useState<SSEConnectionInfo | null>(null);

  // ── Protocol lifecycle ──
  const [lifecycleSteps,  setLifecycleSteps]  = useState<LifecycleStep[]>([]);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});

  // ── History ──
  const [sessions, setSessions] = useState<SSESession[]>([]);

  // ── Reconnect state ──
  // lastEventIdRef: ID of the last SSE event received (kept across resets for reconnect).
  // reconnectLastEventId: set when user disconnects and there's a lastEventId to resume from.
  // reconnectInfo: server's reply telling us how many events were skipped on resume.
  const lastEventIdRef          = useRef<string | null>(null);
  const [reconnectLastEventId,  setReconnectLastEventId]  = useState<string | null>(null);
  const [reconnectInfo,         setReconnectInfo]         = useState<ReconnectResumeInfo | null>(null);
  // Whether the current streaming session is a reconnect (events after this point are replays)
  const isReconnectSessionRef   = useRef(false);

  // ── Refs ──
  const isStreamingRef  = useRef(false);
  const abortRef        = useRef<AbortController | null>(null);
  const sessionStartRef = useRef(0);
  const streamStartRef  = useRef(0);
  const streamTickRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Right-panel drag ──
  const [rightWidth, setRightWidth] = useState(300);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: rightWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setRightWidth(Math.max(240, Math.min(600, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rightWidth]);

  // ── Reset ──
  const reset = useCallback(() => {
    setEvents([]);
    setConnectMs(null);
    setStreamElapsedMs(0);
    setSelectedEventIdx(null);
    setConnectionStatus("idle");
    setResponseType(null);
    setConnectionInfo(null);
    setLifecycleSteps([]);
    setResponseHeaders({});
    lastEventIdRef.current = null;
    setReconnectLastEventId(null);
    setReconnectInfo(null);
    isReconnectSessionRef.current = false;
  }, []);

  // ── Disconnect ──
  const disconnect = useCallback(() => {
    isStreamingRef.current = false;
    abortRef.current?.abort();
    if (streamTickRef.current) {
      clearInterval(streamTickRef.current);
      streamTickRef.current = null;
    }
    setConnectionStatus("closed");
    // Save lastEventId so the user can reconnect and demonstrate Last-Event-ID resumption.
    // Only offer reconnect in virtual mode (real-mode servers may not support resumption).
    if (lastEventIdRef.current) {
      setReconnectLastEventId(lastEventIdRef.current);
    }
  }, []);

  // ── Connect (also used for reconnect when lastEventId is provided) ──
  const connect = useCallback(async (reconnectWithId?: string) => {
    if (isStreamingRef.current) return;

    const isReconnect = !!reconnectWithId;

    if (isReconnect) {
      // Reconnect: keep existing events, append new ones after a visual separator
      setConnectionStatus("connecting");
      isReconnectSessionRef.current = true;
      setReconnectInfo(null);
    } else {
      reset();
      setConnectionStatus("connecting");
      isReconnectSessionRef.current = false;
    }

    isStreamingRef.current = true;
    sessionStartRef.current = Date.now();

    // Virtual mode is always SSE by definition
    if (sseMode === "virtual") setResponseType("sse");

    // Initialize lifecycle steps as pending so the timeline shows from the start
    if (sseMode === "virtual") {
      setLifecycleSteps([
        { id: "dns",         label: "DNS Lookup",      status: "pending" },
        { id: "tcp",         label: "TCP Handshake",   status: "pending" },
        { id: "tls",         label: "TLS Handshake",   status: "pending" },
        { id: "request",     label: "HTTP Request",    status: "pending" },
        { id: "headers",     label: "Response Headers", status: "pending" },
        { id: "stream_open", label: "Stream Opened",   status: "pending" },
      ]);
    } else {
      setLifecycleSteps([
        { id: "connect",     label: "TCP Connect",     status: "pending" },
        { id: "headers",     label: "Response Headers", status: "pending" },
        { id: "stream_open", label: "Stream Opened",   status: "pending" },
      ]);
    }

    const abort = new AbortController();
    abortRef.current = abort;

    let res: Response;
    try {
      res = await fetch("/api/sse", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          mode:              sseMode,
          sessionStartedAt:  sessionStartRef.current,
          ...(sseMode === "real" ? { url: sseUrl, timeoutMs } : {}),
          ...(isReconnect ? { lastEventId: reconnectWithId } : {}),
        }),
        signal: abort.signal,
      });
    } catch {
      if (!isStreamingRef.current) return;
      setConnectionStatus("error");
      isStreamingRef.current = false;
      return;
    }

    if (!res.body || !isStreamingRef.current) {
      setConnectionStatus("error");
      isStreamingRef.current = false;
      return;
    }

    const receivedEvents: SSEEvent[] = [];
    let   connectDurationMs  = 0;
    // On reconnect, event index continues from existing events list length
    let   eventIndex         = isReconnect
      ? await new Promise<number>((resolve) => {
          // Read current length synchronously via a local hack — we just set it from current events
          resolve(0); // will be overridden below
        })
      : 0;

    // We need current events length for indexing on reconnect — read it synchronously
    // by tracking it in a ref
    const eventIndexRef = { current: eventIndex };

    try {
      for await (const evt of readSSE(res, abort.signal)) {
        if (!isStreamingRef.current) break;

        if (evt.type === "phase") {
          const phase  = evt.phase as string;
          const status = evt.status as string;

          if (phase === "connect") {
            if (status === "done") {
              connectDurationMs = evt.durationMs as number;
              setConnectMs(connectDurationMs);
            } else if (status === "error") {
              setConnectionStatus("error");
            }
          } else if (phase === "stream") {
            if (status === "active") {
              setConnectionStatus("streaming");
              streamStartRef.current = Date.now();
              streamTickRef.current = setInterval(() => {
                setStreamElapsedMs(Date.now() - streamStartRef.current);
              }, 100);
            } else if (status === "done" || status === "error") {
              if (streamTickRef.current) {
                clearInterval(streamTickRef.current);
                streamTickRef.current = null;
              }
              setStreamElapsedMs(Date.now() - streamStartRef.current);
            }
          }

        } else if (evt.type === "lifecycle") {
          const stepId      = evt.step as string;
          const stepStatus  = evt.status as LifecycleStepStatus;
          const durationMs  = evt.durationMs as number | undefined;
          const evtLastId   = evt.lastEventId as string | undefined;
          setLifecycleSteps((prev) => prev.map((s) =>
            s.id === stepId
              ? {
                  ...s,
                  status: stepStatus,
                  ...(durationMs !== undefined ? { durationMs } : {}),
                  ...(evtLastId ? { lastEventId: evtLastId } : {}),
                }
              : s
          ));

        } else if (evt.type === "reconnect_resume") {
          // Server confirmed it received Last-Event-ID and will skip delivered events
          const info: ReconnectResumeInfo = {
            lastEventId:    evt.lastEventId as string,
            skippedCount:   evt.skippedCount as number,
            resumingFromId: evt.resumingFromId as string | null,
          };
          setReconnectInfo(info);

        } else if (evt.type === "response_headers") {
          setResponseHeaders(evt.headers as Record<string, string>);

        } else if (evt.type === "connection_info") {
          // Real mode: server tells us whether this is a true SSE endpoint or plain HTTP
          const info: SSEConnectionInfo = {
            isSSE:          evt.isSSE as boolean,
            contentType:    evt.contentType as string,
            httpStatus:     evt.httpStatus as number,
            httpStatusText: evt.httpStatusText as string,
          };
          setResponseType(info.isSSE ? "sse" : "http");
          setConnectionInfo(info);

        } else if (evt.type === "event") {
          const sseEvent: SSEEvent = {
            index:      eventIndexRef.current++,
            id:         evt.id as string | undefined,
            eventType:  evt.eventType as string,
            data:       evt.data as string,
            elapsedMs:  evt.elapsedMs as number,
            receivedAt: Date.now(),
            isReplay:   isReconnectSessionRef.current,
          };
          // Track last event ID for potential future reconnects
          if (sseEvent.id) lastEventIdRef.current = sseEvent.id;
          receivedEvents.push(sseEvent);
          if (isReconnect) {
            setEvents((prev) => {
              // Set the correct index relative to existing events
              const correctedEvent = { ...sseEvent, index: prev.length };
              eventIndexRef.current = prev.length + 1;
              return [...prev, correctedEvent];
            });
          } else {
            setEvents((prev) => [...prev, sseEvent]);
          }

        } else if (evt.type === "error") {
          setConnectionStatus("error");
        }
      }
    } catch { /* aborted */ }

    // Cleanup ticker
    if (streamTickRef.current) {
      clearInterval(streamTickRef.current);
      streamTickRef.current = null;
    }

    // Final elapsed snapshot
    if (streamStartRef.current > 0) {
      setStreamElapsedMs(Date.now() - streamStartRef.current);
    }

    if (isStreamingRef.current) {
      setConnectionStatus("closed");
      isStreamingRef.current = false;
    }

    // Save session summary
    if (receivedEvents.length > 0 || connectDurationMs > 0) {
      const totalMs  = Date.now() - sessionStartRef.current;
      const ivals    = receivedEvents.length > 1
        ? receivedEvents.slice(1).map((e, i) => e.elapsedMs - receivedEvents[i].elapsedMs)
        : [];
      const avgIntervalMs = ivals.length
        ? Math.round(ivals.reduce((s, n) => s + n, 0) / ivals.length)
        : 0;

      setSessions((prev) => [...prev, {
        id:            uid(),
        startedAt:     sessionStartRef.current,
        endedAt:       Date.now(),
        mode:          sseMode,
        url:           sseMode === "real" ? sseUrl : undefined,
        connectMs:     connectDurationMs,
        totalEvents:   receivedEvents.length,
        totalMs,
        avgIntervalMs,
      }]);
    }
  }, [sseMode, sseUrl, timeoutMs, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect ──
  // Initiates a new SSE connection with Last-Event-ID, appending replayed events
  // to the existing event list so the user can see the full before/after picture.
  const reconnect = useCallback((lastEventId: string) => {
    setReconnectLastEventId(null);
    connect(lastEventId);
  }, [connect]);

  // ── Cleanup on unmount ──
  useEffect(() => () => {
    isStreamingRef.current = false;
    abortRef.current?.abort();
    if (streamTickRef.current) clearInterval(streamTickRef.current);
  }, []);

  // ── Derived ──
  const isStreaming  = connectionStatus === "streaming" || connectionStatus === "connecting";
  const isDone       = !isStreaming && events.length > 0;
  const showAnalysis = isDone && selectedEventIdx === null;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">
      <SSETopBar connectionStatus={connectionStatus} responseType={responseType} />

      <div className="flex flex-1 overflow-hidden">
        <SSELeftPanel
          sseMode={sseMode}
          onSetSseMode={(m) => { if (!isStreaming) setSseMode(m); }}
          sseUrl={sseUrl}
          onSelectUrl={setSseUrl}
          events={events}
          sessions={sessions}
          isStreaming={isStreaming}
        />

        <SSEPanel
          sseMode={sseMode}
          sseUrl={sseUrl}
          onSetSseUrl={setSseUrl}
          events={events}
          connectionStatus={connectionStatus}
          connectMs={connectMs}
          streamElapsedMs={streamElapsedMs}
          responseType={responseType}
          connectionInfo={connectionInfo}
          lifecycleSteps={lifecycleSteps}
          responseHeaders={responseHeaders}
          selectedEventIdx={selectedEventIdx}
          reconnectLastEventId={reconnectLastEventId}
          reconnectInfo={reconnectInfo}
          onConnect={() => connect()}
          onDisconnect={disconnect}
          onReset={reset}
          onSelectEvent={setSelectedEventIdx}
          onReconnect={reconnect}
        />

        {showAnalysis ? (
          <SSEAnalysis
            events={events}
            connectMs={connectMs ?? 0}
            streamElapsedMs={streamElapsedMs}
            mode={sseMode}
            responseType={responseType}
            connectionInfo={connectionInfo}
            url={sseMode === "real" ? sseUrl : undefined}
            rightWidth={rightWidth}
            onDragHandleMouseDown={handleDragMouseDown}
          />
        ) : selectedEventIdx !== null && events[selectedEventIdx] ? (
          <SSEEventInspector
            event={events[selectedEventIdx]}
            rightWidth={rightWidth}
            onDragHandleMouseDown={handleDragMouseDown}
            onClose={() => setSelectedEventIdx(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
