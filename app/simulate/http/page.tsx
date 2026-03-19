"use client";

import React, { useState, useCallback, useRef } from "react";

import type {
  AppMode,
  HttpMethod,
  StageId,
  StageStatus,
  StageResult,
  SimMode,
  ViewMode,
  Route,
  RealResult,
  ResponseState,
} from "./types";

import {
  DEFAULT_ROUTES,
  STAGE_DEFS,
  STAGE_BASE_MS,
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

  const stepResolveRef  = useRef<(() => void) | null>(null);
  const abortRef        = useRef<AbortController | null>(null);
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      stepResolveRef.current();
      stepResolveRef.current = null;
      setWaitingStep(false);
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
  }, [isRunning, routes, method, virtualUrl, serverRunning, simMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Auto-cancel after timeout
    const clearTimer = () => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
    timeoutRef.current = setTimeout(() => {
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
    // Accumulated stage data keyed by stage id — assembled into RealResult on complete
    const acc: Record<string, { duration: number; data?: Record<string, unknown> }> = {};

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

            acc[id] = { duration, data };
            // Update stageData immediately so the UI can show details as they arrive
            if (data) setStageData((prev) => ({ ...prev, [id]: data }));

            const existing = results.findIndex((r) => r.id === id);
            const entry: StageResult = { id, status, duration };
            if (existing >= 0) results[existing] = entry;
            else results.push(entry);
            setStages([...results]);

            // Advance the active indicator to the next stage
            const nextIdx = STAGE_IDS.indexOf(id) + 1;
            setCurrentIdx(nextIdx < STAGE_IDS.length ? nextIdx : -1);

          // ── error event ──────────────────────────────────────
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
            clearTimer();
            setSimError(msg);
            setIsDone(true);
            setIsRunning(false);
            return;

          // ── complete event ───────────────────────────────────
          } else if (evt.type === "complete") {
            const total = evt.total as number;

            // Assemble full RealResult from accumulated stage data
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

            setRealResult(assembled);
            setResponse({
              status:    respDat.status,
              headers:   respDat.headers,
              body:      respDat.body,
              totalTime: total,
            });
            setCurrentIdx(-1);
            clearTimer();
            setIsDone(true);
            setIsRunning(false);
          }
        }
      }
    } catch (err) {
      clearTimer();
      const raw = err instanceof Error ? err.message : "Stream read error";
      setSimError(sanitizeError(raw, "unknown"));
      setCurrentIdx(-1);
      setIsDone(true);
      setIsRunning(false);
    }
  }, [isRunning, method, realUrl, reqBody]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSimulation = appMode === "virtual" ? runVirtualSimulation : runRealSimulation;
  const donedStages = stages.filter((s) => s.status === "done" || s.status === "error");

  // ── Drag handle handler ──
  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: rightWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      setRightWidth(Math.min(640, Math.max(200, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

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
      />

      {/* ── 3-panel ── */}
      <div className="flex flex-1 overflow-hidden">

        <LeftPanel
          appMode={appMode}
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

        {/* ── CENTER: Request bar + Lifecycle ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

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
        </div>

        <ResponsePanel
          appMode={appMode}
          method={method}
          virtualUrl={virtualUrl}
          isDone={isDone}
          isRunning={isRunning}
          simError={simError}
          response={response}
          realResult={realResult}
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
