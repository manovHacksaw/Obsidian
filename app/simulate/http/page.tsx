"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";

import type {
  AppMode,
  ProtocolMode,
  HttpMethod,
  StageId,
  StageStatus,
  StageResult,
  SimMode,
  ViewMode,
  Route,
  RealResult,
  ResponseState,
  PollRound,
  PollMode,
  PollSession,
} from "./types";

import {
  DEFAULT_ROUTES,
  STAGE_DEFS,
  STAGE_BASE_MS,
  POLL_STAGE_BASE_MS,
  DEFAULT_POLL_EVENTS,
  sanitizeError,
  substituteParams,
  wait,
  uid,
} from "./constants";

import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/LeftPanel";
import { RequestBar } from "./components/RequestBar";
import { LifecyclePanel } from "./components/LifecyclePanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { InspectOverlay } from "./components/InspectOverlay";
import { PollingPanel } from "./components/PollingPanel";
import { PollingAnalysis } from "./components/PollingAnalysis";

// ── Internal helpers (virtual sim only, not exported) ──────────

function matchRoute(routes: Route[], method: string, path: string) {
  const normalPath = path.startsWith("/") ? path : `/${path}`;
  for (const route of routes) {
    if (route.method !== method) continue;
    const result = matchPath(route.path, normalPath);
    if (result.match) return { route, params: result.params };
  }
  return null;
}

function matchPath(pattern: string, path: string): { match: boolean; params: Record<string, string> } {
  const patParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patParts.length !== pathParts.length) return { match: false, params: {} };
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) params[patParts[i].slice(1)] = pathParts[i];
    else if (patParts[i] !== pathParts[i]) return { match: false, params: {} };
  }
  return { match: true, params };
}

function jitter(base: number) { return Math.max(5, base + Math.floor(Math.random() * 12) - 6); }

// ── Component ──────────────────────────────────────────────────

export default function HttpSimulatePage() {
  // App mode
  const [appMode, setAppMode] = useState<AppMode>("virtual");

  // Virtual server
  const [serverRunning, setServerRunning] = useState(true);
  const [routes, setRoutes] = useState<Route[]>(DEFAULT_ROUTES);
  const [editingRoute, setEditingRoute] = useState<(Omit<Route, "id"> & { id?: string }) | null>(null);
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(null);

  // Request (virtual = path, real = full url)
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [virtualUrl, setVirtualUrl] = useState("/users");
  const [realUrl, setRealUrl] = useState("https://jsonplaceholder.typicode.com/todos/1");
  const [showBody, setShowBody] = useState(false);
  const [reqBody, setReqBody] = useState("");

  // Sim
  const [simMode, setSimMode] = useState<SimMode>("auto");
  const [viewMode, setViewMode] = useState<ViewMode>("visual");
  const [stages, setStages] = useState<StageResult[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [waitingStep, setWaitingStep] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [realResult, setRealResult] = useState<RealResult | null>(null);
  // Progressive stage data — populated as each SSE event arrives
  const [stageData, setStageData] = useState<Record<string, Record<string, unknown>>>({});
  const [expandedBody, setExpandedBody]     = useState(false);
  const [showLifecycle, setShowLifecycle]   = useState(false);
  const [bodyPretty, setBodyPretty]         = useState(true);
  const [bodyCopied, setBodyCopied]     = useState(false);
  const [respTab, setRespTab]           = useState<"body" | "headers" | "raw">("body");
  const [response, setResponse] = useState<ResponseState | null>(null);

  const [timeoutSecs, setTimeoutSecs] = useState(30);

  // ── Polling state ──────────────────────────────────────────────
  const [pollMode,        setPollMode]        = useState<PollMode>("virtual");
  const [pollUrl,         setPollUrl]         = useState("https://jsonplaceholder.typicode.com/todos/1");
  const [pollMethod,      setPollMethod]      = useState<HttpMethod>("GET");
  const [pollIntervalMs,  setPollIntervalMs]  = useState(1000);
  const [maxPollRounds,   setMaxPollRounds]   = useState(15);
  const [pollRounds,      setPollRounds]      = useState<PollRound[]>([]);
  const [isPolling,       setIsPolling]       = useState(false);
  const [currentPollStages, setCurrentPollStages] = useState<StageResult[]>([]);
  const [pollWaiting,     setPollWaiting]     = useState(false);
  const [firedEventIds,   setFiredEventIds]   = useState<string[]>([]);
  const [currentPollRoundIdx, setCurrentPollRoundIdx] = useState(0);
  const [selectedPollRoundIdx, setSelectedPollRoundIdx] = useState<number | null>(null);
  const [pollSessions,    setPollSessions]    = useState<PollSession[]>([]);
  const isPollingRef      = useRef(false);
  const firedEventIdsRef  = useRef(new Set<string>());
  const pollStartRef      = useRef(0);
  const pollRoundAbortRef = useRef<AbortController | null>(null);

  const stepResolveRef     = useRef<(() => void) | null>(null);
  const abortRef           = useRef<AbortController | null>(null);
  const timeoutRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Queue of deferred state-update closures for real step mode
  const realEventQueueRef  = useRef<Array<() => void>>([]);
  // Gate for real step mode: false = open (next event applies immediately),
  // true = closed (waiting for user click before showing next result)
  const stepGateRef        = useRef(false);

  // ── Validation ─────────────────────────────────────────────────
  const urlError: string | null = (() => {
    if (appMode !== "real") return null;
    const v = realUrl.trim();
    if (!v) return "URL is required";
    try { const u = new URL(v); if (u.protocol !== "http:" && u.protocol !== "https:") return "URL must start with http:// or https://"; return null; }
    catch { return "Enter a valid URL — e.g. https://api.example.com/path"; }
  })();
  const bodyError: string | null = (() => {
    if (!showBody || !reqBody.trim()) return null;
    try { JSON.parse(reqBody); return null; }
    catch { return "Body is not valid JSON"; }
  })();
  const validationError = urlError ?? bodyError ?? null;
  const [rightWidth, setRightWidth] = useState(256);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onMoveRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const onUpRef = useRef<(() => void) | null>(null);

  // ── Shared reset ──

  const reset = () => {
    setStages([]);
    setCurrentIdx(-1);
    setResponse(null);
    setRealResult(null);
    setStageData({});
    setExpandedBody(false);
    setShowLifecycle(false);
    setBodyPretty(true);
    setBodyCopied(false);
    setRespTab("body");
    setIsDone(false);
    setSimError(null);
    setWaitingStep(false);
    setHighlightedRouteId(null);
    stepResolveRef.current = null;
    abortRef.current = null;
    realEventQueueRef.current = [];
    stepGateRef.current = false;
  };

  const cancelRequest = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setSimError("Request cancelled by user");
    setIsDone(true);
  };

  // ── Virtual mode ── Route CRUD ──

  const saveRoute = () => {
    if (!editingRoute) return;
    if (editingRoute.id) {
      setRoutes((prev) => prev.map((r) => r.id === editingRoute.id ? { ...editingRoute, id: r.id } : r));
    } else {
      setRoutes((prev) => [...prev, { ...editingRoute, id: uid() }]);
    }
    setEditingRoute(null);
  };

  const tryRoute = (route: Route) => {
    setMethod(route.method);
    setVirtualUrl(route.path.replace(/:([a-z]+)/g, "1"));
    reset();
  };

  // ── Virtual mode ── simulation ──

  const advanceStep = () => {
    if (stepResolveRef.current) {
      // Virtual step mode — resolves the awaited promise in runVirtualSimulation
      stepResolveRef.current();
      stepResolveRef.current = null;
      setWaitingStep(false);
    } else if (stepGateRef.current) {
      // Real step mode — gate is closed (user is looking at a completed stage)
      if (realEventQueueRef.current.length > 0) {
        // More stages already queued — apply the next one, gate stays closed
        const fn = realEventQueueRef.current.shift()!;
        fn();
        // setWaitingStep stays true — another Next click will be needed
      } else {
        // Nothing queued yet — open the gate so the next SSE event auto-shows
        stepGateRef.current = false;
        setWaitingStep(false);
      }
    }
  };

  const waitForStep = () =>
    new Promise<void>((resolve) => {
      stepResolveRef.current = resolve;
      setWaitingStep(true);
    });

  const runVirtualSimulation = useCallback(async () => {
    if (isRunning) return;
    reset();
    setIsRunning(true);

    const startTime = Date.now();
    const results: StageResult[] = [];
    const matched = matchRoute(routes, method, virtualUrl);
    const stagesToRun = !serverRunning ? STAGE_DEFS.slice(0, 2) : STAGE_DEFS;

    for (let i = 0; i < stagesToRun.length; i++) {
      const def = stagesToRun[i];
      const dur = def.id === "processing" ? (matched?.route.delay ?? 100) : jitter(STAGE_BASE_MS[def.id]);

      setCurrentIdx(i);
      const r: StageResult = { id: def.id, status: "active", duration: 0 };
      results.push(r);
      setStages([...results]);

      if (simMode === "step") await waitForStep();

      const animMs = simMode === "auto"
        ? Math.max(700, def.id === "processing" ? Math.min(dur, 1800) : dur)
        : 800;
      await wait(animMs);

      if (!serverRunning && def.id === "tcp") {
        results[i] = { ...r, status: "error", duration: jitter(45) };
        setStages([...results]);
        setSimError("server_offline");
        setIsDone(true);
        setIsRunning(false);
        setCurrentIdx(-1);
        return;
      }

      results[i] = { ...r, status: "done", duration: dur };
      setStages([...results]);
      if (simMode === "auto") await wait(80);
    }

    if (matched) setHighlightedRouteId(matched.route.id);

    const totalTime = Date.now() - startTime;

    if (!matched) {
      setResponse({
        status: 404,
        headers: { "content-type": "application/json", "x-request-id": `sim-${uid()}` },
        body: `{\n  "error": "Not Found",\n  "message": "No route matched ${method} ${virtualUrl}"\n}`,
        totalTime,
      });
    } else {
      const { route, params } = matched;
      const body = substituteParams(route.responseBody, params);
      setResponse({
        status: route.status,
        headers: {
          "content-type": "application/json",
          "content-length": String(body.length),
          "x-request-id": `sim-${uid()}`,
          "x-response-time": `${route.delay}ms`,
        },
        body,
        totalTime,
        matchedRoute: `${route.method} ${route.path}`,
      });
    }

    setIsDone(true);
    setIsRunning(false);
    setCurrentIdx(-1);
  }, [isRunning, routes, method, virtualUrl, serverRunning, simMode]);

  // ── Real mode ── simulation (SSE streaming) ──

  const runRealSimulation = useCallback(async () => {
    if (isRunning) return;
    reset();
    setIsRunning(true);

    // Show DNS as active immediately — something is already happening
    setCurrentIdx(0);

    const STAGE_IDS: StageId[] = ["dns", "tcp", "tls", "request", "processing", "response"];
    const results: StageResult[] = [];

    const abort = new AbortController();
    abortRef.current = abort;
    let completed = false;

    // Auto-cancel after timeout
    const clearTimer = () => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
    timeoutRef.current = setTimeout(() => {
      if (completed) return;
      completed = true;
      abort.abort();
      clearTimer();
      setSimError(`Request timed out after ${timeoutSecs}s. The server did not respond in time.`);
      setCurrentIdx(-1);
      setIsDone(true);
      setIsRunning(false);
    }, timeoutSecs * 1000);

    let res: Response;
    try {
      res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, url: realUrl, headers: {}, body: reqBody || undefined }),
        signal: abort.signal,
      });
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (!isAbort) {
        completed = true;
        clearTimer();
        setStages([{ id: "dns", status: "error", duration: 0 }]);
        setCurrentIdx(-1);
        setSimError("Network error — could not reach API");
        setIsDone(true);
        setIsRunning(false);
      }
      // AbortError just means cancel was clicked — state already updated by cancelRequest()
      return;
    }

    if (!res.body) {
      completed = true;
      clearTimer();
      setSimError("No response stream from server");
      setCurrentIdx(-1);
      setIsDone(true);
      setIsRunning(false);
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // Accumulated stage data — always runs immediately (needed for RealResult assembly)
    const acc: Record<string, { duration: number; data?: Record<string, unknown> }> = {};

    // Gate-based step control for real mode:
    // - Gate open  (false): apply immediately, then close gate and show Next button
    // - Gate closed (true): queue — will be applied when user clicks Next
    const applyOrQueue = (fn: () => void) => {
      if (simMode !== "step") { fn(); return; }

      if (!stepGateRef.current) {
        // Gate open — show this result now, then wait for user
        fn();
        stepGateRef.current = true;
        setWaitingStep(true);
      } else {
        // Gate closed — buffer until user clicks Next
        realEventQueueRef.current.push(fn);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: Record<string, unknown>;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }

          // ── stage event ──────────────────────────────────────
          if (evt.type === "stage") {
            const id       = evt.id as StageId;
            const status   = evt.status as StageStatus;
            const duration = evt.duration as number;
            const data     = evt.data as Record<string, unknown> | undefined;

            // Always accumulate raw data — needed for complete event assembly
            acc[id] = { duration, data };

            const existing = results.findIndex((r) => r.id === id);
            const entry: StageResult = { id, status, duration };
            if (existing >= 0) results[existing] = entry;
            else results.push(entry);

            // Snapshot mutable values before queuing — closures must not capture by reference
            const snapshotStages = [...results];
            const nextIdx = STAGE_IDS.indexOf(id) + 1;
            const snapshotNextIdx = nextIdx < STAGE_IDS.length ? nextIdx : -1;
            const snapshotData = data;
            const snapshotId = id;

            applyOrQueue(() => {
              if (snapshotData) setStageData((prev) => ({ ...prev, [snapshotId]: snapshotData }));
              setStages(snapshotStages);
              // In step mode: reveal this stage as done, no active preview for next.
              // The next stage becomes active only when its own event is dequeued.
              setCurrentIdx(simMode === "step" ? -1 : snapshotNextIdx);
            });

          // ── error event — always applied immediately (terminal state) ──
          } else if (evt.type === "error") {
            const stage = evt.stage as StageId;
            const raw   = (evt.message as string) ?? "";
            const msg   = sanitizeError(raw, stage);
            const existing = results.findIndex((r) => r.id === stage);
            const entry: StageResult = { id: stage, status: "error", duration: 0 };
            if (existing >= 0) results[existing] = entry;
            else results.push(entry);
            setStages([...results]);
            setCurrentIdx(-1);
            completed = true;
            clearTimer();
            realEventQueueRef.current = []; // discard pending steps — error is terminal
            setWaitingStep(false);
            setSimError(msg);
            setIsDone(true);
            setIsRunning(false);
            return;

          // ── complete event ───────────────────────────────────
          } else if (evt.type === "complete") {
            const total = evt.total as number;

            // Assemble full RealResult — acc is always fully populated by this point
            const d = {
              dns:        acc["dns"],
              tcp:        acc["tcp"],
              tls:        acc["tls"],
              request:    acc["request"],
              processing: acc["processing"],
              response:   acc["response"],
            };

            if (!d.dns || !d.tcp || !d.request || !d.processing || !d.response) break;

            const dnsDat  = d.dns.data  as { ip: string; hostname: string };
            const reqDat  = d.request.data  as { raw: string };
            const respDat = d.response.data as {
              status: number; statusText: string;
              headers: Record<string, string>; body: string; bytes: number;
            };
            const tlsDat  = d.tls?.data as {
              version: string; cipher: string;
              cert: { subject: string; issuer: string; validFrom: string; validTo: string; fingerprint: string };
            } | undefined;

            const assembled: RealResult = {
              dns:      { ip: dnsDat.ip, hostname: dnsDat.hostname, duration: d.dns.duration },
              tcp:      { duration: d.tcp.duration },
              tls:      tlsDat
                ? { version: tlsDat.version, cipher: tlsDat.cipher, cert: tlsDat.cert, duration: d.tls!.duration }
                : undefined,
              request:  { raw: reqDat.raw, duration: d.request.duration },
              ttfb:     { duration: d.processing.duration },
              download: { bytes: respDat.bytes, duration: d.response.duration },
              response: {
                status:     respDat.status,
                statusText: respDat.statusText,
                headers:    respDat.headers,
                body:       respDat.body,
              },
              total,
            };

            // Network is done — cancel timeout immediately regardless of step mode
            completed = true;
            clearTimer();

            // Defer visual completion — user steps through remaining stages first
            applyOrQueue(() => {
              setRealResult(assembled);
              setResponse({
                status:    respDat.status,
                headers:   respDat.headers,
                body:      respDat.body,
                totalTime: total,
              });
              setCurrentIdx(-1);
              setIsDone(true);
              setIsRunning(false);
              // Simulation over — no more Next clicks needed, open the gate
              stepGateRef.current = false;
              setWaitingStep(false);
            });
          }
        }
      }
    } catch (err) {
      completed = true;
      clearTimer();
      const raw = err instanceof Error ? err.message : "Stream read error";
      setSimError(sanitizeError(raw, "unknown"));
      setCurrentIdx(-1);
      setIsDone(true);
      setIsRunning(false);
    }
  }, [isRunning, method, realUrl, reqBody, simMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real mode ── true step-by-step (each stage waits for Next click) ──

  const runRealStepSimulation = useCallback(async () => {
    if (isRunning) return;
    reset();
    setIsRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    const results: StageResult[] = [];
    const acc: Record<string, { duration: number; data?: Record<string, unknown> }> = {};
    let sessionId: string | null = null;

    const fail = (stageId: StageId, msg: string) => {
      const id = stageId;
      const existing = results.findIndex((r) => r.id === id);
      const entry: StageResult = { id, status: "error", duration: 0 };
      if (existing >= 0) results[existing] = entry; else results.push(entry);
      setStages([...results]);
      setCurrentIdx(-1);
      setSimError(msg);
      setIsDone(true);
      setIsRunning(false);
    };

    const stageDefinitions = [
      { id: "dns" as StageId, label: "DNS" },
      { id: "tcp" as StageId, label: "TCP" },
      { id: "tls" as StageId, label: "TLS" },
      { id: "request" as StageId, label: "Request" },
      { id: "processing" as StageId, label: "Processing" },
      { id: "response" as StageId, label: "Response" },
    ];

    for (let i = 0; i < stageDefinitions.length; i++) {
      const { id } = stageDefinitions[i];

      // Mark as active
      const activeEntry: StageResult = { id, status: "active", duration: 0 };
      const existingActive = results.findIndex((r) => r.id === id);
      if (existingActive >= 0) results[existingActive] = activeEntry; else results.push(activeEntry);
      setStages([...results]);
      setCurrentIdx(i);

      // Build request payload
      const payload: Record<string, unknown> = { stage: id };
      if (sessionId) payload.sessionId = sessionId;
      if (id === "dns" || id === "request") payload.url = realUrl;
      if (id === "request") {
        payload.method  = method;
        payload.headers = {};
        payload.body    = reqBody || undefined;
      }

      // Execute this stage
      let res: Response;
      try {
        res = await fetch("/api/simulate/stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortRef.current?.signal,
        });
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        if (!isAbort) fail(id, "Network error — could not reach API");
        return;
      }

      let data: Record<string, unknown>;
      try { data = await res.json(); }
      catch { fail(id, "Invalid response from server"); return; }

      // Handle session not found
      if (res.status === 404) {
        fail(id, (data.error as string) ?? "Session expired. Please start over.");
        return;
      }

      // Handle stage error (returned as HTTP 200 with error field)
      if (data.error) {
        fail(id, sanitizeError(data.error as string, id));
        return;
      }

      // Stage succeeded
      if (id === "dns") sessionId = data.sessionId as string;

      const duration = (data.duration as number) ?? 0;
      const stageData_  = data.data as Record<string, unknown> | undefined;

      acc[id] = { duration, data: stageData_ };

      const doneEntry: StageResult = { id, status: data.status === "skipped" ? "skipped" : "done", duration };
      const existingDone = results.findIndex((r) => r.id === id);
      if (existingDone >= 0) results[existingDone] = doneEntry; else results.push(doneEntry);

      if (stageData_) setStageData((prev) => ({ ...prev, [id]: stageData_ }));
      setStages([...results]);
      setCurrentIdx(-1);

      // Wait for user click before proceeding to the next stage (except after response)
      if (i < stageDefinitions.length - 1) {
        await waitForStep();
      }
    }

    // Assemble final result
    const d = {
      dns:        acc["dns"],
      tcp:        acc["tcp"],
      tls:        acc["tls"],
      request:    acc["request"],
      processing: acc["processing"],
      response:   acc["response"],
    };

    if (!d.dns || !d.tcp || !d.request || !d.processing || !d.response) {
      setIsDone(true);
      setIsRunning(false);
      return;
    }

    const dnsDat  = d.dns.data  as { ip: string; hostname: string };
    const reqDat  = d.request.data  as { raw: string };
    const respDat = d.response.data as {
      status: number; statusText: string;
      headers: Record<string, string>; body: string; bytes: number;
    };
    const tlsDat = d.tls?.data as {
      version: string; cipher: string;
      cert: { subject: string; issuer: string; validFrom: string; validTo: string; fingerprint: string };
    } | undefined;

    const total = Object.values(acc).reduce((s, v) => s + (v.duration ?? 0), 0);

    const assembled: RealResult = {
      dns:      { ip: dnsDat.ip, hostname: dnsDat.hostname, duration: d.dns.duration },
      tcp:      { duration: d.tcp.duration },
      tls:      tlsDat
        ? { version: tlsDat.version, cipher: tlsDat.cipher, cert: tlsDat.cert, duration: d.tls!.duration }
        : undefined,
      request:  { raw: reqDat.raw, duration: d.request.duration },
      ttfb:     { duration: d.processing.duration },
      download: { bytes: respDat.bytes, duration: d.response.duration },
      response: {
        status:     respDat.status,
        statusText: respDat.statusText,
        headers:    respDat.headers,
        body:       respDat.body,
      },
      total,
    };

    setRealResult(assembled);
    setResponse({
      status:    respDat.status,
      headers:   respDat.headers,
      body:      respDat.body,
      totalTime: total,
    });
    setIsDone(true);
    setIsRunning(false);
  }, [isRunning, method, realUrl, reqBody]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSimulation =
    appMode === "virtual" ? runVirtualSimulation
    : (simMode === "step"  ? runRealStepSimulation : runRealSimulation);

  // ── Polling ────────────────────────────────────────────────────

  const resetPolling = () => {
    isPollingRef.current = false;
    pollRoundAbortRef.current?.abort();
    pollRoundAbortRef.current = null;
    setIsPolling(false);
    setPollRounds([]);
    setCurrentPollStages([]);
    setFiredEventIds([]);
    setPollWaiting(false);
    setCurrentPollRoundIdx(0);
    setSelectedPollRoundIdx(null);
    firedEventIdsRef.current = new Set();
  };

  const stopPolling = () => {
    isPollingRef.current = false;
    pollRoundAbortRef.current?.abort();
  };

  const runPolling = useCallback(async () => {
    if (isPolling) return;

    // Reset inline
    setPollRounds([]);
    setCurrentPollStages([]);
    setFiredEventIds([]);
    setPollWaiting(false);
    setCurrentPollRoundIdx(0);
    firedEventIdsRef.current = new Set();

    setIsPolling(true);
    isPollingRef.current = true;
    pollStartRef.current = Date.now();

    for (let i = 0; i < maxPollRounds; i++) {
      if (!isPollingRef.current) break;
      setCurrentPollRoundIdx(i);

      const roundStart  = Date.now();
      const roundStages: StageResult[] = [];

      // Animate mini stages
      for (const sid of ["dns", "tcp", "request", "response"] as const) {
        if (!isPollingRef.current) break;
        const dur = jitter(POLL_STAGE_BASE_MS[sid]);
        setCurrentPollStages([...roundStages, { id: sid, status: "active", duration: 0 }]);
        await wait(dur);
        if (!isPollingRef.current) break;
        roundStages.push({ id: sid, status: "done", duration: dur });
        setCurrentPollStages([...roundStages]);
      }

      if (!isPollingRef.current) break;

      // Determine if an event fires this round
      const elapsed = Date.now() - pollStartRef.current;
      const fired = DEFAULT_POLL_EVENTS.find(
        (e) => e.delayMs <= elapsed && !firedEventIdsRef.current.has(e.id)
      );
      if (fired) {
        firedEventIdsRef.current.add(fired.id);
        setFiredEventIds((prev) => [...prev, fired.id]);
      }

      const round: PollRound = {
        index:        i,
        stages:       roundStages,
        status:       fired ? 200 : 304,
        duration:     Date.now() - roundStart,
        startedAt:    roundStart,
        responseBody: fired?.body,
      };

      setPollRounds((prev) => [...prev, round]);
      setCurrentPollStages([]);

      if (!isPollingRef.current) break;

      // Wait for remaining interval in 100ms chunks so stop is responsive
      const remaining = pollIntervalMs - (Date.now() - roundStart);
      if (remaining > 0) {
        setPollWaiting(true);
        let waited = 0;
        while (waited < remaining && isPollingRef.current) {
          const chunk = Math.min(100, remaining - waited);
          await wait(chunk);
          waited += chunk;
        }
        setPollWaiting(false);
      }
    }

    isPollingRef.current = false;
    setIsPolling(false);
    setCurrentPollStages([]);
    setPollWaiting(false);
  }, [isPolling, maxPollRounds, pollIntervalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real polling (each round uses the SSE /api/simulate endpoint) ──

  const runRealPolling = useCallback(async () => {
    if (isPolling) return;

    setPollRounds([]);
    setCurrentPollStages([]);
    setFiredEventIds([]);
    setPollWaiting(false);
    setCurrentPollRoundIdx(0);
    setSelectedPollRoundIdx(null);
    firedEventIdsRef.current = new Set();

    setIsPolling(true);
    isPollingRef.current = true;
    pollStartRef.current = Date.now();

    const STAGE_IDS: StageId[] = ["dns", "tcp", "tls", "request", "processing", "response"];
    let lastBody: string | null = null;
    const completedRounds: PollRound[] = [];

    for (let i = 0; i < maxPollRounds; i++) {
      if (!isPollingRef.current) break;
      setCurrentPollRoundIdx(i);
      setCurrentPollStages([]);

      const roundStart = Date.now();
      const roundStages: StageResult[] = [];
      const acc: Record<string, { duration: number; data?: Record<string, unknown> }> = {};

      const roundAbort = new AbortController();
      pollRoundAbortRef.current = roundAbort;

      let res: Response;
      try {
        res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: pollMethod, url: pollUrl }),
          signal: roundAbort.signal,
        });
      } catch (e) {
        if (!isPollingRef.current) break;
        // Abort or network error — stop this round, try to continue
        continue;
      }

      if (!res.body || !isPollingRef.current) break;

      // Consume the SSE stream, updating currentPollStages as stages arrive
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        outer: while (true) {
          if (!isPollingRef.current) { reader.cancel(); break; }
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let evt: Record<string, unknown>;
            try { evt = JSON.parse(line.slice(6)); } catch { continue; }

            if (evt.type === "stage") {
              const id       = evt.id as StageId;
              const status   = evt.status as StageStatus;
              const duration = evt.duration as number;
              const data     = evt.data as Record<string, unknown> | undefined;
              acc[id] = { duration, data };
              const existing = roundStages.findIndex((s) => s.id === id);
              const entry: StageResult = { id, status, duration };
              if (existing >= 0) roundStages[existing] = entry;
              else roundStages.push(entry);
              setCurrentPollStages([...roundStages]);
            } else if (evt.type === "error" || evt.type === "complete") {
              break outer;
            }
          }
        }
      } catch { /* cancelled */ }

      if (!isPollingRef.current) break;

      // Extract response data
      const respAcc = acc["response"]?.data as {
        status: number; statusText: string;
        headers: Record<string, string>; body: string;
      } | undefined;

      const currentBody = respAcc?.body ?? null;
      const isNewData   = currentBody !== null && currentBody !== lastBody;
      if (isNewData) lastBody = currentBody;

      // Ensure all STAGE_IDS appear (fill skipped/missing)
      for (const sid of STAGE_IDS) {
        if (!roundStages.find((s) => s.id === sid)) {
          roundStages.push({ id: sid, status: "skipped", duration: 0 });
        }
      }

      const round: PollRound = {
        index:          i,
        stages:         roundStages,
        status:         isNewData ? 200 : 304,
        duration:       Date.now() - roundStart,
        startedAt:      roundStart,
        responseBody:   isNewData ? (currentBody ?? undefined) : undefined,
        responseHeaders: respAcc?.headers,
        httpStatus:     respAcc?.status,
        httpStatusText: respAcc?.statusText,
      };

      completedRounds.push(round);
      setPollRounds((prev) => [...prev, round]);
      setCurrentPollStages([]);

      if (!isPollingRef.current) break;

      // Wait remaining interval in 100ms chunks
      const remaining = pollIntervalMs - (Date.now() - roundStart);
      if (remaining > 0) {
        setPollWaiting(true);
        let waited = 0;
        while (waited < remaining && isPollingRef.current) {
          const chunk = Math.min(100, remaining - waited);
          await wait(chunk);
          waited += chunk;
        }
        setPollWaiting(false);
      }
    }

    // Save session to history
    const dataRounds = completedRounds.filter((r) => r.status === 200).length;
    if (completedRounds.length > 0) {
      setPollSessions((prev) => [
        {
          id: uid(),
          startedAt: pollStartRef.current,
          endedAt: Date.now(),
          mode: "real",
          intervalMs: pollIntervalMs,
          totalRounds: completedRounds.length,
          dataRounds,
          url: pollUrl,
        },
        ...prev.slice(0, 9),
      ]);
    }

    isPollingRef.current = false;
    pollRoundAbortRef.current = null;
    setIsPolling(false);
    setCurrentPollStages([]);
    setPollWaiting(false);
  }, [isPolling, maxPollRounds, pollIntervalMs, pollUrl, pollMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigateProtocol = (mode: ProtocolMode) => {
    reset();
    if (mode === "polling") { setAppMode("polling"); return; }
    // "http" → restore virtual sub-mode (real stays real if already real)
    if (appMode === "polling") setAppMode("virtual");
  };
  const donedStages = stages.filter((s) => s.status === "done" || s.status === "error");

  // Derive response for selected poll round → feeds ResponsePanel in polling mode
  const selectedPollResponse: ResponseState | null = (() => {
    if (appMode !== "polling" || selectedPollRoundIdx === null) return null;
    const round = pollRounds[selectedPollRoundIdx];
    if (!round) return null;
    if (round.status === 304) {
      return {
        status: 304,
        headers: round.responseHeaders ?? {},
        body: "// 304 Not Modified — no new data since last poll",
        totalTime: round.duration,
      };
    }
    return {
      status: round.httpStatus ?? 200,
      headers: round.responseHeaders ?? { "content-type": "application/json" },
      body: round.responseBody ?? "",
      totalTime: round.duration,
    };
  })();

  // Label of the most-recently completed stage — shown in the step-mode waiting hint
  const lastCompletedStageLabel: string | null = (() => {
    const last = [...stages].reverse().find((s) => s.status === "done" || s.status === "skipped");
    if (!last) return null;
    return STAGE_DEFS.find((d) => d.id === last.id)?.label ?? null;
  })();

  const cleanupDragHandlers = useCallback(() => {
    if (onMoveRef.current) {
      window.removeEventListener("mousemove", onMoveRef.current);
      onMoveRef.current = null;
    }
    if (onUpRef.current) {
      window.removeEventListener("mouseup", onUpRef.current);
      onUpRef.current = null;
    }
    dragRef.current = null;
  }, []);

  // ── Drag handle handler ──
  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    cleanupDragHandlers();
    dragRef.current = { startX: e.clientX, startW: rightWidth };
    onMoveRef.current = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setRightWidth(Math.min(640, Math.max(200, dragRef.current.startW + delta)));
    };
    onUpRef.current = () => {
      cleanupDragHandlers();
    };
    window.addEventListener("mousemove", onMoveRef.current);
    window.addEventListener("mouseup", onUpRef.current);
  };

  useEffect(() => cleanupDragHandlers, [cleanupDragHandlers]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      <TopBar
        appMode={appMode}
        viewMode={viewMode}
        serverRunning={serverRunning}
        onSetAppMode={setAppMode}
        onSetViewMode={setViewMode}
        onReset={reset}
        onNavigateProtocol={handleNavigateProtocol}
      />

      {/* ── 3-panel ── */}
      <div className="flex flex-1 overflow-hidden">

        <LeftPanel
          appMode={appMode}
          onSetAppMode={setAppMode}
          pollMode={pollMode}
          onSetPollMode={setPollMode}
          pollEvents={DEFAULT_POLL_EVENTS}
          firedEventIds={firedEventIds}
          pollSessions={pollSessions}
          onSelectPollTarget={(url, meth) => { setPollUrl(url); setPollMethod(meth); }}
          serverRunning={serverRunning}
          routes={routes}
          editingRoute={editingRoute}
          highlightedRouteId={highlightedRouteId}
          onToggleServer={() => setServerRunning((s) => !s)}
          onSetEditingRoute={setEditingRoute}
          onSaveRoute={saveRoute}
          onTryRoute={tryRoute}
          onDeleteRoute={(id) => setRoutes((p) => p.filter((r) => r.id !== id))}
          realUrl={realUrl}
          realResult={realResult}
          onSetRealUrl={setRealUrl}
          onSetMethod={setMethod}
          onReset={reset}
        />

        {/* ── CENTER ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {appMode === "polling" ? (
            <PollingPanel
              pollMode={pollMode}
              pollUrl={pollUrl}
              pollMethod={pollMethod}
              pollRounds={pollRounds}
              currentPollStages={currentPollStages}
              currentRoundIdx={currentPollRoundIdx}
              isPolling={isPolling}
              pollWaiting={pollWaiting}
              pollIntervalMs={pollIntervalMs}
              maxPollRounds={maxPollRounds}
              selectedRoundIdx={selectedPollRoundIdx}
              onSetPollUrl={setPollUrl}
              onSetPollMethod={setPollMethod}
              onSetInterval={setPollIntervalMs}
              onSetMaxRounds={setMaxPollRounds}
              onStart={pollMode === "real" ? runRealPolling : runPolling}
              onStop={stopPolling}
              onReset={resetPolling}
              onSelectRound={setSelectedPollRoundIdx}
            />
          ) : (
            <>
              <RequestBar
                appMode={appMode}
                method={method}
                virtualUrl={virtualUrl}
                realUrl={realUrl}
                simMode={simMode}
                isRunning={isRunning}
                isDone={isDone}
                waitingStep={waitingStep}
                validationError={validationError}
                showBody={showBody}
                reqBody={reqBody}
                timeoutSecs={timeoutSecs}
                routes={routes}
                realResult={realResult}
                lastCompletedStageLabel={lastCompletedStageLabel}
                onSetMethod={setMethod}
                onSetVirtualUrl={setVirtualUrl}
                onSetRealUrl={setRealUrl}
                onSetSimMode={setSimMode}
                onRunSimulation={runSimulation}
                onAdvanceStep={advanceStep}
                onCancelRequest={cancelRequest}
                onReset={reset}
                onSetShowBody={setShowBody}
                onSetReqBody={setReqBody}
                onSetTimeoutSecs={setTimeoutSecs}
                onTryRoute={tryRoute}
              />
              <LifecyclePanel
                appMode={appMode}
                method={method}
                virtualUrl={virtualUrl}
                realUrl={realUrl}
                reqBody={reqBody}
                viewMode={viewMode}
                stages={stages}
                currentIdx={currentIdx}
                isRunning={isRunning}
                isDone={isDone}
                simError={simError}
                stageData={stageData}
                donedStages={donedStages}
                serverRunning={serverRunning}
                realResult={realResult}
                response={response}
              />
            </>
          )}
        </div>

        {appMode === "polling" && !isPolling && pollRounds.length > 0 && selectedPollRoundIdx === null ? (
          <PollingAnalysis
            rounds={pollRounds}
            intervalMs={pollIntervalMs}
            mode={pollMode}
            pollUrl={pollMode === "real" ? pollUrl : undefined}
            rightWidth={rightWidth}
            onDragHandleMouseDown={handleDragMouseDown}
          />
        ) : (appMode !== "polling" || selectedPollRoundIdx !== null) && (
          <ResponsePanel
            appMode={appMode}
            method={appMode === "polling" ? pollMethod : method}
            virtualUrl={appMode === "polling" ? (pollUrl || "polling") : virtualUrl}
            isDone={appMode === "polling" ? selectedPollRoundIdx !== null : isDone}
            isRunning={appMode === "polling" ? false : isRunning}
            simError={appMode === "polling" ? null : simError}
            response={appMode === "polling" ? selectedPollResponse : response}
            realResult={appMode === "polling" ? null : realResult}
            respTab={respTab}
            bodyPretty={bodyPretty}
            bodyCopied={bodyCopied}
            rightWidth={rightWidth}
            expandedBody={expandedBody}
            onSetRespTab={setRespTab}
            onSetBodyPretty={setBodyPretty}
            onSetBodyCopied={setBodyCopied}
            onSetExpandedBody={setExpandedBody}
            onShowLifecycle={() => setShowLifecycle(true)}
            onDragHandleMouseDown={handleDragMouseDown}
          />
        )}
      </div>

      <InspectOverlay
        expandedBody={showLifecycle}
        realResult={realResult}
        realUrl={realUrl}
        bodyPretty={bodyPretty}
        bodyCopied={bodyCopied}
        onClose={() => setShowLifecycle(false)}
        onSetBodyPretty={setBodyPretty}
        onSetBodyCopied={setBodyCopied}
      />
    </div>
  );
}
