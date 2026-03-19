"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────

type AppMode = "virtual" | "real";
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type StageId = "dns" | "tcp" | "tls" | "request" | "processing" | "response";
type StageStatus = "idle" | "active" | "done" | "error" | "skipped";
type SimMode = "auto" | "step";
type ViewMode = "visual" | "raw";

interface Route {
  id: string;
  method: HttpMethod;
  path: string;
  status: number;
  responseBody: string;
  delay: number;
  description?: string;
}

interface StageResult {
  id: StageId;
  status: StageStatus;
  duration: number;
}

// What the /api/simulate endpoint returns
interface RealResult {
  dns:      { ip: string; hostname: string; duration: number };
  tcp:      { duration: number };
  tls?:     { version: string; cipher: string; cert: { subject: string; issuer: string; validFrom: string; validTo: string; fingerprint: string }; duration: number };
  request:  { raw: string; duration: number };
  ttfb:     { duration: number };
  download: { bytes: number; duration: number };
  response: { status: number; statusText: string; headers: Record<string, string>; body: string };
  total:    number;
  error?:   string;
}

// ── Constants ──────────────────────────────────────────────────

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

const METHOD_COLORS: Record<HttpMethod, { text: string; bg: string; border: string }> = {
  GET:    { text: "text-blue-400",   bg: "bg-blue-500/15",   border: "border-blue-500/30" },
  POST:   { text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30" },
  PUT:    { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30" },
  DELETE: { text: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/30" },
  PATCH:  { text: "text-purple-400", bg: "bg-purple-500/15", border: "border-purple-500/30" },
};

const DEFAULT_ROUTES: Route[] = [
  {
    id: "r1", method: "GET", path: "/users", status: 200, delay: 80,
    description: "List all users",
    responseBody: '{\n  "users": [\n    { "id": 1, "name": "Alice", "role": "admin" },\n    { "id": 2, "name": "Bob", "role": "user" }\n  ],\n  "total": 2\n}',
  },
  {
    id: "r2", method: "GET", path: "/users/:id", status: 200, delay: 60,
    description: "Get user by ID",
    responseBody: '{\n  "id": ":id",\n  "name": "User :id",\n  "role": "user"\n}',
  },
  {
    id: "r3", method: "POST", path: "/users", status: 201, delay: 120,
    description: "Create a new user",
    responseBody: '{\n  "id": 3,\n  "message": "User created successfully"\n}',
  },
  {
    id: "r4", method: "DELETE", path: "/users/:id", status: 200, delay: 90,
    description: "Delete user by ID",
    responseBody: '{\n  "message": "User :id deleted",\n  "success": true\n}',
  },
];

const REAL_PRESETS = [
  { label: "JSONPlaceholder",  url: "https://jsonplaceholder.typicode.com/todos/1",    method: "GET" as HttpMethod },
  { label: "GitHub Zen",       url: "https://api.github.com/zen",                      method: "GET" as HttpMethod },
  { label: "httpbin GET",      url: "https://httpbin.org/get",                         method: "GET" as HttpMethod },
  { label: "httpbin POST",     url: "https://httpbin.org/post",                        method: "POST" as HttpMethod },
  { label: "Localhost :3000",  url: "http://localhost:3000",                           method: "GET" as HttpMethod },
  { label: "Localhost :3001",  url: "http://localhost:3001",                           method: "GET" as HttpMethod },
];

const STAGE_DEFS: { id: StageId; label: string; desc: string; realDesc: string; direction: "→" | "←" | "⚙" }[] = [
  { id: "dns",        label: "DNS Resolution",   desc: "Resolving hostname to IP",           realDesc: "OS resolver → actual A record lookup",    direction: "→" },
  { id: "tcp",        label: "TCP Handshake",     desc: "SYN → SYN-ACK → ACK",               realDesc: "Real 3-way handshake, measured in ms",    direction: "→" },
  { id: "tls",        label: "TLS Handshake",     desc: "Certificate negotiation",            realDesc: "ClientHello → ServerHello → cert chain",  direction: "→" },
  { id: "request",    label: "HTTP Request",      desc: "Method, path, headers sent",         realDesc: "Raw HTTP/1.1 written to socket",          direction: "→" },
  { id: "processing", label: "Server Processing", desc: "Route matched, response generated",  realDesc: "Time To First Byte (TTFB)",               direction: "⚙" },
  { id: "response",   label: "HTTP Response",     desc: "Status + headers + body returned",   realDesc: "Download time, full body received",       direction: "←" },
];

const STAGE_BASE_MS: Record<StageId, number> = {
  dns: 18, tcp: 42, tls: 78, request: 8, processing: 0, response: 15,
};

const STAGE_BAR_COLORS: Record<StageId, string> = {
  dns: "bg-blue-500", tcp: "bg-purple-500", tls: "bg-yellow-500",
  request: "bg-orange-400", processing: "bg-[#ff8f6f]", response: "bg-green-500",
};
const STAGE_TEXT_COLORS: Record<StageId, string> = {
  dns: "text-blue-400", tcp: "text-purple-400", tls: "text-yellow-400",
  request: "text-orange-400", processing: "text-[#ff8f6f]", response: "text-green-400",
};

const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 204: "No Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
  404: "Not Found", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
};

const BLANK_ROUTE: Omit<Route, "id"> = {
  method: "GET", path: "/", status: 200,
  responseBody: '{\n  "message": "OK"\n}', delay: 100, description: "",
};

// ── Utilities ──────────────────────────────────────────────────

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

function substituteParams(body: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((b, [k, v]) => b.replaceAll(`:${k}`, v), body);
}

function statusColor(s: number): string {
  if (s >= 200 && s < 300) return "text-green-400";
  if (s >= 300 && s < 400) return "text-blue-400";
  if (s >= 400 && s < 500) return "text-yellow-400";
  return "text-red-400";
}

function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
function jitter(base: number) { return Math.max(5, base + Math.floor(Math.random() * 12) - 6); }
function uid() { return Math.random().toString(36).slice(2, 10); }

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
  const [response, setResponse] = useState<{
    status: number;
    headers: Record<string, string>;
    body: string;
    totalTime: number;
    matchedRoute?: string;
  } | null>(null);

  const stepResolveRef = useRef<(() => void) | null>(null);

  // ── Shared reset ──

  const reset = () => {
    setStages([]);
    setCurrentIdx(-1);
    setResponse(null);
    setRealResult(null);
    setIsDone(false);
    setSimError(null);
    setWaitingStep(false);
    setHighlightedRouteId(null);
    stepResolveRef.current = null;
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

  // ── Real mode ── simulation ──

  const runRealSimulation = useCallback(async () => {
    if (isRunning) return;
    reset();
    setIsRunning(true);

    // Kick off the real network request immediately
    const apiCall = fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, url: realUrl, headers: {}, body: reqBody || undefined }),
    }).then((r) => r.json() as Promise<RealResult>);

    // While it runs, show DNS as active (something is happening)
    setCurrentIdx(0);
    setStages([{ id: "dns", status: "active", duration: 0 }]);

    let data: RealResult;
    try {
      data = await apiCall;
    } catch {
      setSimError("network_error");
      setStages([{ id: "dns", status: "error", duration: 0 }]);
      setIsDone(true);
      setIsRunning(false);
      setCurrentIdx(-1);
      return;
    }

    if (data.error) {
      // Map error to the right failed stage
      const errMsg = data.error.toLowerCase();
      const failedStage: StageId =
        errMsg.includes("dns")  ? "dns"  :
        errMsg.includes("tcp")  ? "tcp"  :
        errMsg.includes("tls")  ? "tls"  : "dns";

      setStages([{ id: failedStage, status: "error", duration: 0 }]);
      setCurrentIdx(-1);
      setSimError(data.error);
      setIsDone(true);
      setIsRunning(false);
      return;
    }

    // Map API result to stage order
    const isHttps = realUrl.startsWith("https");
    const stageData: { id: StageId; duration: number; skip?: boolean }[] = [
      { id: "dns",        duration: data.dns.duration },
      { id: "tcp",        duration: data.tcp.duration },
      { id: "tls",        duration: data.tls?.duration ?? 0, skip: !isHttps },
      { id: "request",    duration: data.request.duration },
      { id: "processing", duration: data.ttfb.duration },     // TTFB = server processing
      { id: "response",   duration: data.download.duration }, // download = response transfer
    ];

    // Replay stages with real durations, brief animation per step
    const results: StageResult[] = [];
    for (let i = 0; i < stageData.length; i++) {
      const { id, duration, skip } = stageData[i];

      if (skip) {
        results.push({ id, status: "skipped", duration: 0 });
        setStages([...results]);
        continue;
      }

      setCurrentIdx(i);
      results.push({ id, status: "active", duration: 0 });
      setStages([...results]);
      await wait(350); // brief pause so user sees the stage activate

      results[i] = { id, status: "done", duration };
      setStages([...results]);
      await wait(60);
    }

    setRealResult(data);
    setResponse({
      status: data.response.status,
      headers: data.response.headers,
      body: data.response.body,
      totalTime: data.total,
    });
    setIsDone(true);
    setIsRunning(false);
    setCurrentIdx(-1);
  }, [isRunning, method, realUrl, reqBody]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSimulation = appMode === "virtual" ? runVirtualSimulation : runRealSimulation;
  const donedStages = stages.filter((s) => s.status === "done" || s.status === "error");

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      {/* ── Top bar ── */}
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
                onClick={() => { setAppMode(m); reset(); }}
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
                onClick={() => setViewMode(v)}
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

      {/* ── 3-panel ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT panel ── */}
        {appMode === "virtual" ? (
          // Virtual: server toggle + route list
          <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden">
            {/* Server toggle */}
            <div className="p-4 border-b border-white/5 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575]">Virtual Server</span>
                <button
                  onClick={() => setServerRunning((s) => !s)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] font-bold font-body uppercase tracking-widest transition-all border ${
                    serverRunning
                      ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25"
                      : "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${serverRunning ? "bg-green-400" : "bg-red-500"}`} />
                  {serverRunning ? "Running" : "Stopped"}
                </button>
              </div>
              <p className="text-[9px] font-body text-[#494847] leading-relaxed">
                {serverRunning
                  ? "All routes active. Requests will be processed."
                  : "Offline. All requests fail at TCP."}
              </p>
            </div>

            {/* Routes header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575]">
                Routes ({routes.length})
              </span>
              <button
                onClick={() => setEditingRoute({ ...BLANK_ROUTE })}
                className="flex items-center gap-1 text-[10px] font-bold font-body text-[#ff8f6f] hover:text-[#ff7851] transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Route
              </button>
            </div>

            {/* Routes list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 min-h-0">
              {routes.length === 0 && (
                <div className="text-center py-8 opacity-30">
                  <span className="material-symbols-outlined text-2xl text-[#adaaaa] block mb-2">route</span>
                  <p className="text-[10px] font-body text-[#adaaaa]">No routes. Add one above.</p>
                </div>
              )}
              {routes.map((route) => {
                const mc = METHOD_COLORS[route.method];
                const isHighlighted = highlightedRouteId === route.id;
                return (
                  <div
                    key={route.id}
                    className={`group relative p-3 rounded-sm transition-all border ${
                      isHighlighted
                        ? "bg-[#ff8f6f]/8 border-[#ff8f6f]/25"
                        : "bg-[#1a1919] hover:bg-[#201f1f] border-transparent"
                    }`}
                  >
                    {isHighlighted && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#ff8f6f] rounded-l-sm" />}
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`text-[9px] font-black font-body px-1.5 py-0.5 rounded-sm shrink-0 ${mc.text} ${mc.bg} border ${mc.border}`}>
                        {route.method}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-white truncate">{route.path}</div>
                        {route.description && (
                          <div className="text-[9px] font-body text-[#494847] truncate mt-0.5">{route.description}</div>
                        )}
                      </div>
                      <span className={`text-[9px] font-bold font-body shrink-0 ${statusColor(route.status)}`}>
                        {route.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => tryRoute(route)} className="flex items-center gap-1 text-[9px] font-body text-[#adaaaa] hover:text-[#ff8f6f] transition-colors">
                        <span className="material-symbols-outlined text-xs">play_arrow</span>Try
                      </button>
                      <span className="text-[#262626]">·</span>
                      <button onClick={() => setEditingRoute({ ...route })} className="text-[9px] font-body text-[#adaaaa] hover:text-white transition-colors">Edit</button>
                      <span className="text-[#262626]">·</span>
                      <button onClick={() => setRoutes((p) => p.filter((r) => r.id !== route.id))} className="text-[9px] font-body text-[#adaaaa] hover:text-red-400 transition-colors">Delete</button>
                      <span className="ml-auto text-[9px] font-body text-[#494847]">{route.delay}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inline route editor */}
            <AnimatePresence>
              {editingRoute && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 border-t border-white/5 bg-[#1a1919] overflow-hidden"
                >
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575]">
                        {editingRoute.id ? "Edit Route" : "New Route"}
                      </span>
                      <button onClick={() => setEditingRoute(null)} className="text-[#494847] hover:text-white text-base leading-none">×</button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={editingRoute.method}
                        onChange={(e) => setEditingRoute((r) => r && { ...r, method: e.target.value as HttpMethod })}
                        className="bg-[#0e0e0e] border border-white/5 text-[#ff8f6f] text-xs font-black font-body px-2 py-2 rounded-sm focus:outline-none w-24 shrink-0"
                      >
                        {METHODS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      <input
                        value={editingRoute.path}
                        onChange={(e) => setEditingRoute((r) => r && { ...r, path: e.target.value })}
                        className="flex-1 bg-[#0e0e0e] border border-white/5 text-white text-xs font-mono px-2 py-2 rounded-sm focus:outline-none focus:border-[#ff8f6f]/30 min-w-0"
                        placeholder="/path/:param"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="w-20 shrink-0">
                        <span className="text-[9px] text-[#adaaaa] block mb-1">Status</span>
                        <input
                          type="number"
                          value={editingRoute.status}
                          onChange={(e) => setEditingRoute((r) => r && { ...r, status: parseInt(e.target.value) || 200 })}
                          className="w-full bg-[#0e0e0e] border border-white/5 text-white text-xs font-body px-2 py-2 rounded-sm focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-[9px] text-[#adaaaa]">Delay</span>
                          <span className="text-[9px] text-[#ff8f6f] font-bold">{editingRoute.delay}ms</span>
                        </div>
                        <input
                          type="range" min={0} max={3000} step={50}
                          value={editingRoute.delay}
                          onChange={(e) => setEditingRoute((r) => r && { ...r, delay: parseInt(e.target.value) })}
                          className="w-full accent-[#ff8f6f] mt-1.5"
                        />
                      </div>
                    </div>
                    <input
                      value={editingRoute.description ?? ""}
                      onChange={(e) => setEditingRoute((r) => r && { ...r, description: e.target.value })}
                      className="w-full bg-[#0e0e0e] border border-white/5 text-[#adaaaa] text-[10px] font-body px-2 py-2 rounded-sm focus:outline-none"
                      placeholder="Description (optional)"
                    />
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[9px] text-[#adaaaa]">Response Body</span>
                        <span className="text-[9px] text-[#494847]">:param substitution supported</span>
                      </div>
                      <textarea
                        value={editingRoute.responseBody}
                        onChange={(e) => setEditingRoute((r) => r && { ...r, responseBody: e.target.value })}
                        rows={5}
                        className="w-full bg-[#0e0e0e] border border-white/5 text-[#adaaaa] text-[10px] font-mono px-2 py-2 rounded-sm focus:outline-none focus:border-[#ff8f6f]/30 resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingRoute(null)} className="flex-1 py-2 text-[10px] font-bold font-body text-[#adaaaa] hover:text-white border border-white/10 rounded-sm transition-colors">Cancel</button>
                      <button onClick={saveRoute} className="flex-1 py-2 text-[10px] font-bold font-body bg-[#ff8f6f] text-[#5c1400] rounded-sm hover:bg-[#ff7851] transition-colors">
                        {editingRoute.id ? "Save Changes" : "Add Route"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          // Real: preset URLs + cert info after request
          <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Presets */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">
                  Quick Targets
                </span>
                <div className="space-y-1">
                  {REAL_PRESETS.map((p) => (
                    <button
                      key={p.url}
                      onClick={() => { setRealUrl(p.url); setMethod(p.method); reset(); }}
                      className={`w-full text-left px-3 py-2 rounded-sm transition-colors border ${
                        realUrl === p.url
                          ? "bg-[#ff8f6f]/10 border-[#ff8f6f]/20 text-[#ff8f6f]"
                          : "bg-[#1a1919] border-transparent hover:bg-[#201f1f] text-[#adaaaa] hover:text-white"
                      }`}
                    >
                      <div className="text-[10px] font-bold font-body">{p.label}</div>
                      <div className="text-[9px] font-mono text-[#494847] truncate mt-0.5">{p.url}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* TLS cert info — only after a real HTTPS result */}
              {realResult?.tls && (
                <>
                  <div className="h-px bg-white/5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-3">
                      TLS Certificate
                    </span>
                    <div className="space-y-2.5">
                      {[
                        { label: "Subject",    value: realResult.tls.cert.subject },
                        { label: "Issuer",     value: realResult.tls.cert.issuer },
                        { label: "Protocol",   value: realResult.tls.version },
                        { label: "Cipher",     value: realResult.tls.cipher },
                        { label: "Valid From", value: realResult.tls.cert.validFrom },
                        { label: "Valid To",   value: realResult.tls.cert.validTo },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-[#494847] mb-0.5">{label}</div>
                          <div className="text-[10px] font-mono text-[#adaaaa] break-all">{value}</div>
                        </div>
                      ))}
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[#494847] mb-0.5">Fingerprint</div>
                        <div className="text-[9px] font-mono text-[#494847] break-all">{realResult.tls.cert.fingerprint}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* DNS result */}
              {realResult?.dns && (
                <>
                  <div className="h-px bg-white/5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">
                      DNS Resolution
                    </span>
                    <div className="space-y-2">
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[#494847] mb-0.5">Hostname</div>
                        <div className="text-[10px] font-mono text-[#adaaaa]">{realResult.dns.hostname}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-[#494847] mb-0.5">Resolved IP</div>
                        <div className="text-[10px] font-mono text-[#ff8f6f]">{realResult.dns.ip}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── CENTER: Request bar + Lifecycle ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Request bar */}
          <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as HttpMethod)}
                className={`bg-[#1a1919] border border-white/5 text-xs font-black font-body px-3 py-2.5 rounded-sm focus:outline-none w-24 shrink-0 ${METHOD_COLORS[method].text}`}
              >
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>

              {appMode === "virtual" ? (
                <input
                  value={virtualUrl}
                  onChange={(e) => setVirtualUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) runSimulation(); }}
                  className="flex-1 bg-[#1a1919] border border-white/5 text-white text-sm font-mono px-3 py-2.5 rounded-sm focus:outline-none focus:border-[#ff8f6f]/30 min-w-0"
                  placeholder="/api/endpoint"
                />
              ) : (
                <input
                  value={realUrl}
                  onChange={(e) => setRealUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) runSimulation(); }}
                  className="flex-1 bg-[#1a1919] border border-white/5 text-white text-sm font-mono px-3 py-2.5 rounded-sm focus:outline-none focus:border-[#ff8f6f]/30 min-w-0"
                  placeholder="https://example.com/api/endpoint"
                />
              )}

              {/* Sim mode — only for virtual */}
              {appMode === "virtual" && (
                <div className="flex bg-[#1a1919] rounded-sm overflow-hidden border border-white/5 shrink-0">
                  {(["auto", "step"] as SimMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSimMode(m)}
                      className={`px-3 py-2.5 text-[10px] font-bold font-body uppercase tracking-widest transition-colors ${
                        simMode === m ? "bg-[#ff8f6f] text-[#5c1400]" : "text-[#adaaaa] hover:text-white"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {/* Step advance */}
              {appMode === "virtual" && simMode === "step" && waitingStep && isRunning ? (
                <button
                  onClick={advanceStep}
                  className="px-4 py-2.5 font-headline font-bold text-sm bg-[#1a1919] border border-[#ff8f6f]/30 text-[#ff8f6f] rounded-sm transition-all flex items-center gap-2 shrink-0 hover:bg-[#201f1f]"
                >
                  <span className="material-symbols-outlined text-base">skip_next</span>Next
                </button>
              ) : (
                <button
                  onClick={isRunning ? undefined : runSimulation}
                  disabled={isRunning}
                  className={`px-5 py-2.5 font-headline font-bold text-sm rounded-sm transition-all flex items-center gap-2 shrink-0 ${
                    isRunning
                      ? "bg-[#1a1919] text-[#494847] cursor-not-allowed"
                      : "bg-[#ff8f6f] text-[#5c1400] hover:bg-[#ff7851] active:scale-95 shadow-[0_4px_20px_-4px_rgba(255,143,111,0.4)]"
                  }`}
                >
                  {isRunning ? (
                    <motion.span className="material-symbols-outlined text-base" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>refresh</motion.span>
                  ) : (
                    <span className="material-symbols-outlined text-base">send</span>
                  )}
                  Send
                </button>
              )}

              {isDone && !isRunning && (
                <button onClick={reset} className="text-[10px] font-body text-[#adaaaa] hover:text-white transition-colors px-2 shrink-0">Reset</button>
              )}
            </div>

            {/* Body + quick pills */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowBody((s) => !s)}
                className="text-[9px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">{showBody ? "expand_less" : "expand_more"}</span>
                {showBody ? "Hide body" : "Add body"}
              </button>

              {appMode === "virtual" && (
                <div className="flex gap-1.5 ml-auto overflow-x-auto">
                  {routes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => tryRoute(r)}
                      className={`text-[9px] font-body px-2 py-1 rounded-sm whitespace-nowrap transition-colors border ${METHOD_COLORS[r.method].text} ${METHOD_COLORS[r.method].bg} ${METHOD_COLORS[r.method].border}`}
                    >
                      {r.method} {r.path}
                    </button>
                  ))}
                </div>
              )}

              {appMode === "real" && realResult && (
                <div className="ml-auto flex items-center gap-2 text-[9px] font-body text-[#494847]">
                  <span className="text-blue-400">DNS {realResult.dns.duration}ms</span>
                  <span>·</span>
                  <span className="text-purple-400">TCP {realResult.tcp.duration}ms</span>
                  {realResult.tls && <><span>·</span><span className="text-yellow-400">TLS {realResult.tls.duration}ms</span></>}
                  <span>·</span>
                  <span className="text-[#ff8f6f]">TTFB {realResult.ttfb.duration}ms</span>
                </div>
              )}
            </div>

            <AnimatePresence>
              {showBody && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <textarea
                    value={reqBody}
                    onChange={(e) => setReqBody(e.target.value)}
                    rows={3}
                    placeholder='{ "name": "Alice" }'
                    className="w-full bg-[#1a1919] border border-white/5 text-[#adaaaa] text-[11px] font-mono px-3 py-2 rounded-sm focus:outline-none focus:border-[#ff8f6f]/30 resize-none"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Lifecycle */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {viewMode === "visual" ? (
              <div className="flex-1 overflow-y-auto p-6">
                {/* Client ↔ Server diagram */}
                <div className="relative flex items-center justify-between mb-8 px-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 bg-[#1a1919] border border-white/10 rounded-sm flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#adaaaa] text-2xl">computer</span>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#adaaaa]">Client</span>
                  </div>

                  <div className="flex-1 relative h-8 mx-6">
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-[#262626]" />
                    <AnimatePresence>
                      {isRunning && currentIdx >= 0 && (() => {
                        const def = STAGE_DEFS[currentIdx];
                        if (!def || def.direction === "⚙") return null;
                        const toLeft = def.direction === "←";
                        return (
                          <motion.div
                            key={`pkt-${currentIdx}`}
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#ff8f6f]"
                            style={{ boxShadow: "0 0 12px rgba(255,143,111,0.8)" }}
                            initial={{ left: toLeft ? "100%" : "0%" }}
                            animate={{ left: toLeft ? "0%" : "100%" }}
                            transition={{ duration: 0.7, ease: "linear", repeat: Infinity }}
                          />
                        );
                      })()}
                    </AnimatePresence>
                    {isRunning && currentIdx >= 0 && STAGE_DEFS[currentIdx] && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-body text-[#ff8f6f] uppercase tracking-widest whitespace-nowrap">
                        {STAGE_DEFS[currentIdx].label}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-14 h-14 bg-[#1a1919] rounded-sm flex items-center justify-center transition-all border ${
                      appMode === "real" ? "border-[#ff8f6f]/20" :
                      !serverRunning ? "border-red-500/40" :
                      currentIdx === 4 ? "border-[#ff8f6f]/40" : "border-white/10"
                    }`}>
                      <span className={`material-symbols-outlined text-2xl ${
                        appMode === "real" ? "text-[#ff8f6f]" :
                        !serverRunning ? "text-red-400" :
                        currentIdx === 4 ? "text-[#ff8f6f]" : "text-[#adaaaa]"
                      }`}>
                        {appMode === "real" ? "travel_explore" : serverRunning ? "dns" : "cloud_off"}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#adaaaa]">
                      {appMode === "real" ? "Internet" : serverRunning ? "Server" : "Offline"}
                    </span>
                  </div>
                </div>

                {/* Stage list */}
                <div className="space-y-1.5">
                  {STAGE_DEFS.map((def, i) => {
                    const result = stages.find((s) => s.id === def.id);
                    const isActive = currentIdx === i;
                    const done = result?.status === "done";
                    const err = result?.status === "error";
                    const skipped = result?.status === "skipped";
                    const pending = !result && !isActive;

                    // Real-mode detail pills shown after stage completes
                    const realDetails: { label: string; value: string; highlight?: boolean }[] = [];
                    if (done && appMode === "real" && realResult) {
                      if (def.id === "dns") {
                        realDetails.push({ label: "hostname", value: realResult.dns.hostname });
                        realDetails.push({ label: "→ ip", value: realResult.dns.ip, highlight: true });
                      } else if (def.id === "tcp") {
                        const port = (() => { try { const u = new URL(realUrl); return u.port || (realUrl.startsWith("https") ? "443" : "80"); } catch { return "?"; } })();
                        realDetails.push({ label: "ip", value: realResult.dns.ip });
                        realDetails.push({ label: "port", value: port, highlight: true });
                      } else if (def.id === "tls" && realResult.tls) {
                        realDetails.push({ label: "protocol", value: realResult.tls.version, highlight: true });
                        realDetails.push({ label: "cipher", value: realResult.tls.cipher });
                        realDetails.push({ label: "issuer", value: realResult.tls.cert.issuer });
                      } else if (def.id === "request") {
                        const firstLine = realResult.request.raw.split("\r\n")[0] ?? "";
                        realDetails.push({ label: "sent", value: firstLine, highlight: true });
                        realDetails.push({ label: "bytes", value: String(new TextEncoder().encode(realResult.request.raw).length) });
                      } else if (def.id === "processing") {
                        realDetails.push({ label: "ttfb", value: `${realResult.ttfb.duration}ms`, highlight: true });
                        realDetails.push({ label: "status", value: String(realResult.response.status) });
                      } else if (def.id === "response") {
                        realDetails.push({ label: "status", value: `${realResult.response.status} ${realResult.response.statusText}`, highlight: true });
                        realDetails.push({ label: "bytes", value: realResult.download.bytes.toLocaleString() });
                        const ct = realResult.response.headers["content-type"];
                        if (ct) realDetails.push({ label: "content-type", value: ct.split(";")[0] });
                      }
                    }

                    return (
                      <motion.div
                        key={def.id}
                        animate={{ opacity: pending ? 0.35 : skipped ? 0.2 : 1 }}
                        className={`flex items-start gap-4 p-4 rounded-sm transition-all ${
                          isActive  ? "bg-[#1a1919] border border-[#ff8f6f]/20" :
                          done      ? "bg-[#1a1919]/60" :
                          err       ? "bg-red-500/10 border border-red-500/20" :
                          "bg-transparent"
                        }`}
                      >
                        {/* Status icon */}
                        <div className={`w-6 h-6 rounded-sm flex items-center justify-center shrink-0 mt-0.5 ${
                          isActive ? "bg-[#ff8f6f]/20" : done ? "bg-green-500/20" : err ? "bg-red-500/20" : "bg-[#262626]"
                        }`}>
                          {done    && <span className="material-symbols-outlined text-green-400 text-sm">check</span>}
                          {err     && <span className="material-symbols-outlined text-red-400 text-sm">close</span>}
                          {skipped && <span className="material-symbols-outlined text-[#494847] text-sm">remove</span>}
                          {isActive && (
                            <motion.div
                              className="w-2 h-2 rounded-full bg-[#ff8f6f]"
                              animate={{ scale: [1, 1.5, 1] }}
                              transition={{ repeat: Infinity, duration: 0.7 }}
                            />
                          )}
                          {pending && <div className="w-2 h-2 rounded-full bg-[#494847]" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold font-body ${
                                isActive ? "text-white" : done ? "text-[#adaaaa]" : err ? "text-red-400" : skipped ? "text-[#262626]" : "text-[#494847]"
                              }`}>
                                {def.label}
                              </span>
                              {skipped && <span className="text-[9px] font-body text-[#262626]">— HTTP, no TLS</span>}
                            </div>
                            {(done || err) && result && (
                              <span className={`text-[10px] font-bold font-body tabular-nums shrink-0 ${err ? "text-red-400" : "text-[#ff8f6f]"}`}>
                                {err ? "FAILED" : `${result.duration}ms`}
                              </span>
                            )}
                            {isActive && <span className="text-[10px] text-[#adaaaa] animate-pulse shrink-0">...</span>}
                          </div>

                          {/* Description — real mode shows different text */}
                          <p className="text-[10px] font-body text-[#494847] mt-0.5">
                            {appMode === "real" ? def.realDesc : def.desc}
                          </p>

                          {/* Real-mode data pills */}
                          <AnimatePresence>
                            {realDetails.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, delay: 0.1 }}
                                className="mt-2.5 flex flex-wrap gap-1.5"
                              >
                                {realDetails.map(({ label, value, highlight }) => (
                                  <div
                                    key={label}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[9px] font-mono ${
                                      highlight
                                        ? "bg-[#ff8f6f]/8 border-[#ff8f6f]/20 text-[#ff8f6f]"
                                        : "bg-[#262626] border-white/5 text-[#777575]"
                                    }`}
                                  >
                                    <span className={highlight ? "text-[#ff8f6f]/50" : "text-[#494847]"}>{label}</span>
                                    <span className="text-[#262626] mx-0.5">·</span>
                                    <span className="truncate max-w-[180px]">{value}</span>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {isActive && (
                            <motion.div
                              className="mt-2 h-px bg-[#ff8f6f] origin-left"
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3, ease: "linear" }}
                            />
                          )}
                          {err && simError && (
                            <p className="text-[10px] font-body text-red-400/70 mt-1">{simError}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {stages.length === 0 && !isRunning && (
                  <div className="mt-16 flex flex-col items-center gap-3 opacity-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-[#adaaaa]">
                      {appMode === "real" ? "travel_explore" : "send"}
                    </span>
                    <p className="text-xs font-body text-[#adaaaa]">
                      {appMode === "real" ? "Enter a URL and press Send" : "Pick a route and press Send"}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Raw HTTP */
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {stages.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 mt-12 opacity-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-[#adaaaa]">code</span>
                    <p className="text-xs font-body text-[#adaaaa]">Raw HTTP appears after simulation</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[10px] font-bold font-body uppercase tracking-widest text-[#ff8f6f]">▶ Request</span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                      <pre className="bg-[#1a1919] border border-white/5 rounded-sm p-4 text-[11px] leading-relaxed overflow-x-auto font-mono">
                        {appMode === "real" && realResult?.request.raw ? (
                          <>
                            <span className="text-[#ff8f6f] font-bold">{realResult.request.raw.split("\r\n")[0]}</span>
                            {"\n"}
                            <span className="text-[#adaaaa]">{realResult.request.raw.split("\r\n").slice(1).join("\n")}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[#ff8f6f] font-bold">{method}</span>
                            {` ${virtualUrl} HTTP/1.1\n`}
                            <span className="text-[#adaaaa]">{"Host: localhost\nAccept: application/json\nUser-Agent: ObsidianSim/1.0"}</span>
                            {reqBody && <span className="text-[#adaaaa]">{`\n\n${reqBody}`}</span>}
                          </>
                        )}
                      </pre>
                    </div>

                    {response && (
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-[10px] font-bold font-body uppercase tracking-widest text-[#ff8f6f]">◀ Response</span>
                          <div className="flex-1 h-px bg-white/5" />
                        </div>
                        <pre className="bg-[#1a1919] border border-white/5 rounded-sm p-4 text-[11px] leading-relaxed overflow-x-auto font-mono">
                          <span className={`font-bold ${statusColor(response.status)}`}>
                            {`HTTP/1.1 ${response.status} ${STATUS_TEXT[response.status] ?? ""}\n`}
                          </span>
                          {Object.entries(response.headers).map(([k, v]) => (
                            <span key={k} className="text-[#adaaaa]">{`${k}: ${v}\n`}</span>
                          ))}
                          {"\n"}
                          <span className="text-white">{response.body}</span>
                        </pre>
                      </div>
                    )}

                    {isDone && simError && !response && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-4">
                        <pre className="text-red-400 text-[11px] font-mono">× {simError}</pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Timeline */}
            {donedStages.length > 0 && (
              <div className="shrink-0 border-t border-white/5 bg-[#0a0a0a] p-4">
                <div className="flex items-center mb-2">
                  <span className="text-[9px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">Timeline</span>
                  {isDone && response && (
                    <span className="text-[9px] font-body text-[#ff8f6f] ml-auto">{response.totalTime}ms total</span>
                  )}
                </div>
                <div className="relative h-5 bg-[#1a1919] rounded-sm overflow-hidden mb-2">
                  <div className="absolute inset-0 flex">
                    {(() => {
                      const total = donedStages.reduce((s, x) => s + x.duration, 0) || 1;
                      return donedStages.map((s) => (
                        <div
                          key={s.id}
                          className={`${STAGE_BAR_COLORS[s.id]} h-full opacity-75`}
                          style={{ width: `${Math.max((s.duration / total) * 100, 1.5)}%` }}
                          title={`${s.id}: ${s.duration}ms`}
                        />
                      ));
                    })()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {donedStages.map((s) => (
                    <span key={s.id} className={`text-[9px] font-body font-bold uppercase ${STAGE_TEXT_COLORS[s.id]}`}>
                      {s.id} {s.status === "error" ? "ERR" : `${s.duration}ms`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Response ── */}
        <div className="w-64 shrink-0 border-l border-white/5 bg-[#0e0e0e] overflow-y-auto">
          <div className="p-4">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] mb-4">Response</label>

            {!isDone && !isRunning && (
              <div className="flex flex-col items-center gap-3 py-12 opacity-20">
                <span className="material-symbols-outlined text-3xl text-[#adaaaa]">hourglass_empty</span>
                <p className="text-[10px] font-body text-[#adaaaa] text-center">Hit Send to see response</p>
              </div>
            )}

            {isRunning && (
              <div className="flex flex-col items-center gap-3 py-12 opacity-60">
                <motion.span className="material-symbols-outlined text-3xl text-[#ff8f6f]" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  refresh
                </motion.span>
                <p className="text-[10px] font-body text-[#adaaaa]">
                  {appMode === "real" ? "Making real request..." : "Simulating..."}
                </p>
              </div>
            )}

            {isDone && simError && !response && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-sm">
                <span className="material-symbols-outlined text-red-400 text-base shrink-0">error</span>
                <div>
                  <div className="text-sm font-bold text-red-400 font-body">Failed</div>
                  <div className="text-[10px] text-red-400/70 mt-0.5">{simError}</div>
                </div>
              </div>
            )}

            {isDone && response && (
              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center justify-between p-3 bg-[#1a1919] rounded-sm border border-white/5">
                  <span className={`text-2xl font-black font-headline ${statusColor(response.status)}`}>
                    {response.status}
                  </span>
                  <div className="text-right">
                    <div className={`text-xs font-bold font-body ${statusColor(response.status)}`}>
                      {STATUS_TEXT[response.status] ?? realResult?.response.statusText ?? ""}
                    </div>
                    <div className="text-[10px] text-[#adaaaa] font-body">{response.totalTime}ms</div>
                  </div>
                </div>

                {/* Virtual: matched route */}
                {response.matchedRoute && (
                  <div className="px-3 py-2 bg-[#1a1919] rounded-sm border border-[#ff8f6f]/15">
                    <div className="text-[9px] text-[#777575] uppercase tracking-widest mb-1">Matched Route</div>
                    <div className="text-[10px] font-mono text-[#ff8f6f]">{response.matchedRoute}</div>
                  </div>
                )}

                {/* Real: download info */}
                {appMode === "real" && realResult && (
                  <div className="px-3 py-2 bg-[#1a1919] rounded-sm border border-white/5">
                    <div className="text-[9px] text-[#777575] uppercase tracking-widest mb-1">Transfer</div>
                    <div className="text-[10px] font-mono text-[#adaaaa]">{realResult.download.bytes.toLocaleString()} bytes in {realResult.download.duration}ms</div>
                  </div>
                )}

                {/* 404 hint (virtual) */}
                {!response.matchedRoute && response.status === 404 && appMode === "virtual" && (
                  <div className="px-3 py-2 bg-yellow-500/10 rounded-sm border border-yellow-500/20">
                    <div className="text-[9px] text-yellow-400 uppercase tracking-widest mb-1">No Route Matched</div>
                    <div className="text-[10px] font-body text-yellow-400/70">Add a route for {method} {virtualUrl}</div>
                  </div>
                )}

                {/* Headers */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">Headers</span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {Object.entries(response.headers).map(([k, v]) => (
                      <div key={k} className="text-[10px] font-mono">
                        <span className="text-[#ff8f6f]">{k}</span>
                        <span className="text-[#494847]">: </span>
                        <span className="text-[#adaaaa] break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Body */}
                {response.body && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">Body</span>
                    <pre className="bg-[#1a1919] border border-white/5 rounded-sm p-3 text-[10px] text-[#adaaaa] font-mono overflow-x-auto max-h-64">
                      {response.body}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
