"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { LongPollMode, LongPollPhaseResult, LongPollRound, LongPollSession } from "./types";
import {
  DEFAULT_LP_TIMEOUT_MS,
  DEFAULT_LP_MAX_ROUNDS,
  DEFAULT_LP_EVENTS,
  LP_PHASE_BASE_MS,
  wait,
  uid,
  jitter,
} from "./constants";
import { LongPollTopBar }    from "./components/LongPollTopBar";
import { LongPollLeftPanel } from "./components/LongPollLeftPanel";
import { LongPollPanel }     from "./components/LongPollPanel";
import { LongPollAnalysis }  from "./components/LongPollAnalysis";
import { ResponsePanel }     from "../http/components/ResponsePanel";
import type { ResponseState } from "../http/types";

// ── SSE reader helper ────────────────────────────────────────────

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

export default function LongPollPage() {

  // ── Mode ──
  const [lpMode,      setLpMode]      = useState<LongPollMode>("virtual");
  const [lpUrl,       setLpUrl]       = useState("https://httpbin.org/delay/4");
  const [lpTimeoutMs, setLpTimeoutMs] = useState(DEFAULT_LP_TIMEOUT_MS);
  const [maxRounds,   setMaxRounds]   = useState(DEFAULT_LP_MAX_ROUNDS);

  // ── Session data ──
  const [rounds,          setRounds]          = useState<LongPollRound[]>([]);
  const [isConnected,     setIsConnected]     = useState(false);
  const [currentPhases,   setCurrentPhases]   = useState<LongPollPhaseResult[]>([]);
  const [currentHoldMs,   setCurrentHoldMs]   = useState(0);
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState<number | null>(null);
  const [firedEventIds,   setFiredEventIds]   = useState<string[]>([]);
  const [sessions,        setSessions]        = useState<LongPollSession[]>([]);

  // ── Refs ──
  const isConnectedRef       = useRef(false);
  const roundAbortRef        = useRef<AbortController | null>(null);
  const sessionStartRef      = useRef(0);
  const firedEventIdsRef     = useRef(new Set<string>());
  const currentHoldMsRef     = useRef(0);

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

  // ── Derived: selected round response ──
  const selectedResponse: ResponseState | null =
    selectedRoundIdx !== null && rounds[selectedRoundIdx]?.status === "data"
      ? {
          status:       rounds[selectedRoundIdx].httpStatus ?? 200,
          headers:      rounds[selectedRoundIdx].responseHeaders ?? {},
          body:         rounds[selectedRoundIdx].responseBody ?? "",
          totalTime:    rounds[selectedRoundIdx].totalMs,
        }
      : null;

  // ── Active status for TopBar ──
  const activeStatus = isConnected
    ? currentPhases.some((p) => p.phase === "hold" && p.status === "active")
      ? "holding"
      : "connected"
    : null;

  // ── Reset ──
  const reset = useCallback(() => {
    setRounds([]);
    setCurrentPhases([]);
    setCurrentHoldMs(0);
    setFiredEventIds([]);
    setSelectedRoundIdx(null);
    setCurrentRoundIdx(0);
    firedEventIdsRef.current = new Set();
    currentHoldMsRef.current = 0;
  }, []);

  // ── Disconnect ──
  const disconnect = useCallback(() => {
    isConnectedRef.current = false;
    roundAbortRef.current?.abort();
    setIsConnected(false);
    setCurrentPhases([]);
    setCurrentHoldMs(0);
  }, []);

  // ── Virtual loop ──────────────────────────────────────────────

  const runVirtual = useCallback(async () => {
    if (isConnectedRef.current) return;

    reset();
    setIsConnected(true);
    isConnectedRef.current = true;
    sessionStartRef.current = Date.now();
    firedEventIdsRef.current = new Set();

    const completedRounds: LongPollRound[] = [];

    for (let i = 0; i < maxRounds; i++) {
      if (!isConnectedRef.current) break;

      setCurrentRoundIdx(i);
      setCurrentHoldMs(0);
      currentHoldMsRef.current = 0;

      const roundStart = Date.now();

      const abort = new AbortController();
      roundAbortRef.current = abort;

      let res: Response;
      try {
        res = await fetch("/api/long-poll", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            mode:             "virtual",
            sessionStartedAt: sessionStartRef.current,
            firedEventIds:    [...firedEventIdsRef.current],
            timeoutMs:        lpTimeoutMs,
          }),
          signal: abort.signal,
        });
      } catch {
        if (!isConnectedRef.current) break;
        continue;
      }

      if (!res.body || !isConnectedRef.current) break;

      const phases: LongPollPhaseResult[] = [];
      let roundStatus: LongPollRound["status"] = "timeout";
      let holdMs      = 0;
      let respondMs   = 0;
      let eventBody: string | undefined;
      let eventId: string | undefined;

      try {
        for await (const evt of readSSE(res, abort.signal)) {
          if (!isConnectedRef.current) break;

          if (evt.type === "phase") {
            const phase    = evt.phase as LongPollPhaseResult["phase"];
            const status   = evt.status as LongPollPhaseResult["status"];
            const duration = (evt.durationMs as number) ?? 0;

            const existing = phases.findIndex((p) => p.phase === phase);
            const entry: LongPollPhaseResult = { phase, status, durationMs: duration };
            if (existing >= 0) phases[existing] = entry; else phases.push(entry);
            setCurrentPhases([...phases]);

          } else if (evt.type === "hold_tick") {
            const elapsed = evt.elapsedMs as number;
            currentHoldMsRef.current = elapsed;
            setCurrentHoldMs(elapsed);

          } else if (evt.type === "respond") {
            roundStatus = evt.status as LongPollRound["status"];
            holdMs      = evt.holdMs as number;
            respondMs   = evt.respondMs as number;
            if (roundStatus === "data") {
              eventBody = evt.body as string;
              eventId   = evt.eventId as string;
            }
          }
        }
      } catch { /* aborted */ }

      if (!isConnectedRef.current) break;

      // Finalize phases (mark hold + respond as done with correct durations)
      const finalPhases: LongPollPhaseResult[] = [
        phases.find((p) => p.phase === "connect") ?? { phase: "connect", status: "done", durationMs: jitter(LP_PHASE_BASE_MS.connect) },
        { phase: "hold",    status: "done", durationMs: holdMs    },
        { phase: "respond", status: "done", durationMs: respondMs },
      ];

      if (eventId) {
        firedEventIdsRef.current.add(eventId);
        setFiredEventIds((prev) => [...prev, eventId!]);
      }

      const round: LongPollRound = {
        index:        i,
        phases:       finalPhases,
        status:       roundStatus,
        holdMs,
        totalMs:      Date.now() - roundStart,
        startedAt:    roundStart,
        responseBody: eventBody,
      };

      completedRounds.push(round);
      setRounds((prev) => [...prev, round]);
      setCurrentPhases([]);
      setCurrentHoldMs(0);

      if (!isConnectedRef.current) break;

      // All events fired — no point continuing
      if (firedEventIdsRef.current.size >= DEFAULT_LP_EVENTS.length &&
          DEFAULT_LP_EVENTS.every((e) => firedEventIdsRef.current.has(e.id))) {
        // One final brief pause so user sees the last row
        await wait(400);
        break;
      }

      // Brief breath between rounds (immediate reconnect — this is the point)
      await wait(50);
    }

    // Save session
    const dr = completedRounds.filter((r) => r.status === "data").length;
    const tr = completedRounds.filter((r) => r.status === "timeout").length;
    if (completedRounds.length > 0) {
      setSessions((prev) => [...prev, {
        id:           uid(),
        startedAt:    sessionStartRef.current,
        endedAt:      Date.now(),
        mode:         "virtual",
        timeoutMs:    lpTimeoutMs,
        totalRounds:  completedRounds.length,
        dataRounds:   dr,
        timeoutRounds: tr,
      }]);
    }

    isConnectedRef.current = false;
    setIsConnected(false);
    setCurrentPhases([]);
    setCurrentHoldMs(0);
  }, [maxRounds, lpTimeoutMs, reset]);

  // ── Real loop ─────────────────────────────────────────────────

  const runReal = useCallback(async () => {
    if (isConnectedRef.current) return;

    reset();
    setIsConnected(true);
    isConnectedRef.current = true;
    sessionStartRef.current = Date.now();

    const completedRounds: LongPollRound[] = [];

    for (let i = 0; i < maxRounds; i++) {
      if (!isConnectedRef.current) break;

      setCurrentRoundIdx(i);
      setCurrentHoldMs(0);
      currentHoldMsRef.current = 0;

      const roundStart = Date.now();

      const abort = new AbortController();
      roundAbortRef.current = abort;

      let res: Response;
      try {
        res = await fetch("/api/long-poll", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ mode: "real", url: lpUrl, timeoutMs: lpTimeoutMs }),
          signal:  abort.signal,
        });
      } catch {
        if (!isConnectedRef.current) break;
        continue;
      }

      if (!res.body || !isConnectedRef.current) break;

      const phases: LongPollPhaseResult[] = [];
      let roundStatus: LongPollRound["status"] = "timeout";
      let holdMs      = 0;
      let respondMs   = 0;
      let responseBody: string | undefined;
      let responseHeaders: Record<string, string> | undefined;
      let httpStatus: number | undefined;
      let httpStatusText: string | undefined;

      try {
        for await (const evt of readSSE(res, abort.signal)) {
          if (!isConnectedRef.current) break;

          if (evt.type === "phase") {
            const phase    = evt.phase as LongPollPhaseResult["phase"];
            const status   = evt.status as LongPollPhaseResult["status"];
            const duration = (evt.durationMs as number) ?? 0;
            const existing = phases.findIndex((p) => p.phase === phase);
            const entry: LongPollPhaseResult = { phase, status, durationMs: duration };
            if (existing >= 0) phases[existing] = entry; else phases.push(entry);
            setCurrentPhases([...phases]);

          } else if (evt.type === "hold_tick") {
            const elapsed = evt.elapsedMs as number;
            currentHoldMsRef.current = elapsed;
            setCurrentHoldMs(elapsed);

          } else if (evt.type === "respond") {
            roundStatus    = evt.status as LongPollRound["status"];
            holdMs         = evt.holdMs as number;
            respondMs      = evt.respondMs as number;
            if (roundStatus === "data") {
              responseBody    = evt.body as string;
              responseHeaders = evt.headers as Record<string, string> | undefined;
              httpStatus      = evt.httpStatus as number | undefined;
              httpStatusText  = evt.httpStatusText as string | undefined;
            }
          }
        }
      } catch { /* aborted */ }

      if (!isConnectedRef.current) break;

      const finalPhases: LongPollPhaseResult[] = [
        phases.find((p) => p.phase === "connect") ?? { phase: "connect", status: "done", durationMs: 8 },
        { phase: "hold",    status: "done", durationMs: holdMs    },
        { phase: "respond", status: "done", durationMs: respondMs },
      ];

      const round: LongPollRound = {
        index:          i,
        phases:         finalPhases,
        status:         roundStatus,
        holdMs,
        totalMs:        Date.now() - roundStart,
        startedAt:      roundStart,
        responseBody,
        responseHeaders,
        httpStatus,
        httpStatusText,
      };

      completedRounds.push(round);
      setRounds((prev) => [...prev, round]);
      setCurrentPhases([]);
      setCurrentHoldMs(0);

      if (!isConnectedRef.current) break;
      await wait(50);
    }

    const dr = completedRounds.filter((r) => r.status === "data").length;
    const tr = completedRounds.filter((r) => r.status === "timeout").length;
    if (completedRounds.length > 0) {
      setSessions((prev) => [...prev, {
        id:           uid(),
        startedAt:    sessionStartRef.current,
        endedAt:      Date.now(),
        mode:         "real",
        timeoutMs:    lpTimeoutMs,
        totalRounds:  completedRounds.length,
        dataRounds:   dr,
        timeoutRounds: tr,
        url:          lpUrl,
      }]);
    }

    isConnectedRef.current = false;
    setIsConnected(false);
    setCurrentPhases([]);
    setCurrentHoldMs(0);
  }, [maxRounds, lpTimeoutMs, lpUrl, reset]);

  // ── Cleanup on unmount ──
  useEffect(() => () => { isConnectedRef.current = false; roundAbortRef.current?.abort(); }, []);

  // ── Show analysis panel ──
  const showAnalysis = !isConnected && rounds.length > 0 && selectedRoundIdx === null;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">
      <LongPollTopBar
        isConnected={isConnected}
        activeStatus={activeStatus as "holding" | null}
      />

      <div className="flex flex-1 overflow-hidden">
        <LongPollLeftPanel
          lpMode={lpMode}
          onSetLpMode={(m) => { if (!isConnected) setLpMode(m); }}
          lpUrl={lpUrl}
          onSelectTarget={setLpUrl}
          firedEventIds={firedEventIds}
          sessions={sessions}
          isConnected={isConnected}
        />

        <LongPollPanel
          lpMode={lpMode}
          lpUrl={lpUrl}
          onSetLpUrl={setLpUrl}
          rounds={rounds}
          currentPhases={currentPhases}
          currentHoldMs={currentHoldMs}
          currentRoundIdx={currentRoundIdx}
          isConnected={isConnected}
          lpTimeoutMs={lpTimeoutMs}
          maxRounds={maxRounds}
          selectedRoundIdx={selectedRoundIdx}
          onSetTimeoutMs={setLpTimeoutMs}
          onSetMaxRounds={setMaxRounds}
          onConnect={lpMode === "real" ? runReal : runVirtual}
          onDisconnect={disconnect}
          onReset={reset}
          onSelectRound={setSelectedRoundIdx}
        />

        {showAnalysis ? (
          <LongPollAnalysis
            rounds={rounds}
            timeoutMs={lpTimeoutMs}
            mode={lpMode}
            lpUrl={lpMode === "real" ? lpUrl : undefined}
            rightWidth={rightWidth}
            onDragHandleMouseDown={handleDragMouseDown}
          />
        ) : selectedRoundIdx !== null ? (
          <ResponsePanel
            appMode="real"
            method="GET"
            virtualUrl={lpUrl}
            isDone={true}
            isRunning={false}
            simError={null}
            response={selectedResponse}
            realResult={null}
            respTab="body"
            bodyPretty={true}
            bodyCopied={false}
            rightWidth={rightWidth}
            expandedBody={false}
            onSetRespTab={() => {}}
            onSetBodyPretty={() => {}}
            onSetBodyCopied={() => {}}
            onSetExpandedBody={() => {}}
            onShowLifecycle={() => {}}
            onDragHandleMouseDown={handleDragMouseDown}
          />
        ) : null}
      </div>
    </div>
  );
}
