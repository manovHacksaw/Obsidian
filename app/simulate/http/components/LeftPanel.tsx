"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppMode, HttpMethod, Route, RealResult, PollMode, PollSession } from "../types";
import { METHODS, METHOD_COLORS, POLLING_REAL_PRESETS, REAL_PRESETS, statusColor, type PollEvent } from "../constants";

const BLANK_ROUTE: Omit<Route, "id"> = {
  method: "GET", path: "/", status: 200,
  responseBody: '{\n  "message": "OK"\n}', delay: 100, description: "",
};

interface LeftPanelProps {
  appMode: AppMode;
  onSetAppMode: (m: AppMode) => void;
  // Polling props
  pollMode: PollMode;
  onSetPollMode: (m: PollMode) => void;
  pollEvents: PollEvent[];
  firedEventIds: string[];
  pollSessions: PollSession[];
  onSelectPollTarget: (url: string, meth: HttpMethod) => void;
  // Virtual props
  serverRunning: boolean;
  routes: Route[];
  editingRoute: (Omit<Route, "id"> & { id?: string }) | null;
  highlightedRouteId: string | null;
  onToggleServer: () => void;
  onSetEditingRoute: (r: (Omit<Route, "id"> & { id?: string }) | null) => void;
  onSaveRoute: () => void;
  onTryRoute: (route: Route) => void;
  onDeleteRoute: (id: string) => void;
  // Real props
  realUrl: string;
  realResult: RealResult | null;
  onSetRealUrl: (url: string) => void;
  onSetMethod: (m: HttpMethod) => void;
  onReset: () => void;
}

// Shared Virtual/Real mode toggle shown at the top of the left panel for HTTP modes
function HttpModeToggle({ appMode, onSetAppMode, onReset }: {
  appMode: AppMode;
  onSetAppMode: (m: AppMode) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex border-b border-white/5 shrink-0">
      {(["virtual", "real"] as const).map((m) => (
        <button
          key={m}
          onClick={() => { if (appMode !== m) { onSetAppMode(m); onReset(); } }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-bold font-body uppercase tracking-widest transition-colors ${
            appMode === m
              ? "text-[#ff8f6f] border-b-2 border-[#ff8f6f] -mb-px"
              : "text-[#494847] hover:text-[#adaaaa]"
          }`}
        >
          <span className="material-symbols-outlined text-xs">
            {m === "virtual" ? "dns" : "travel_explore"}
          </span>
          {m}
        </button>
      ))}
    </div>
  );
}

export function LeftPanel({
  appMode,
  onSetAppMode,
  pollMode,
  onSetPollMode,
  pollEvents,
  firedEventIds,
  pollSessions,
  onSelectPollTarget,
  serverRunning,
  routes,
  editingRoute,
  highlightedRouteId,
  onToggleServer,
  onSetEditingRoute,
  onSaveRoute,
  onTryRoute,
  onDeleteRoute,
  realUrl,
  realResult,
  onSetRealUrl,
  onSetMethod,
  onReset,
}: LeftPanelProps) {

  // ── Polling branch ─────────────────────────────────────────────
  if (appMode === "polling") {
    return (
      <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden">

        {/* Virtual / Real mode toggle */}
        <div className="flex border-b border-white/5 shrink-0">
          {(["virtual", "real"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onSetPollMode(m)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[9px] font-bold font-body uppercase tracking-widest transition-colors ${
                pollMode === m
                  ? "text-[#ff8f6f] border-b-2 border-[#ff8f6f] -mb-px"
                  : "text-[#494847] hover:text-[#adaaaa]"
              }`}
            >
              <span className="material-symbols-outlined text-xs">
                {m === "virtual" ? "dns" : "travel_explore"}
              </span>
              {m}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">

          {pollMode === "real" ? (
            /* ── Real mode: Quick Targets ── */
            <div className="p-4 space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block mb-2">
                  Quick Targets
                </span>
                <div className="space-y-1">
                  {POLLING_REAL_PRESETS.map((p) => (
                    <button
                      key={p.url}
                      onClick={() => onSelectPollTarget(p.url, p.method)}
                      className="w-full text-left px-3 py-2 rounded-sm transition-colors border bg-[#1a1919] border-transparent hover:bg-[#201f1f] text-[#adaaaa] hover:text-white"
                    >
                      <div className="text-[10px] font-bold font-body">{p.label}</div>
                      <div className="text-[9px] font-mono text-[#494847] truncate mt-0.5">{p.url}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Why it's costly */}
              <div className="h-px bg-white/5" />
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#3a3939]">Why it&apos;s costly</span>
                <div className="space-y-1.5">
                  {[
                    { icon: "wifi",        text: "Full TCP handshake on every poll" },
                    { icon: "timer",       text: "Latency = up to 1 full interval" },
                    { icon: "trending_up", text: "Server load scales with client count" },
                  ].map(({ icon, text }) => (
                    <div key={icon} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[#2e2e2e] shrink-0 mt-px" style={{ fontSize: "11px", lineHeight: 1.4 }}>{icon}</span>
                      <span className="text-[9px] font-body text-[#2e2e2e] leading-relaxed">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ── Virtual mode: Event Queue ── */
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 shrink-0">
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#494847]">Server Event Queue</span>
                <span className="text-[9px] font-body text-[#2e2e2e]">{firedEventIds.length}/{pollEvents.length} fired</span>
              </div>
              <div className="px-2 pb-2 pt-2 space-y-1.5">
                {pollEvents.map((evt) => {
                  const fired = firedEventIds.includes(evt.id);
                  const bodyPreview = evt.body.replace(/\s+/g, " ").trim().slice(0, 55);
                  return (
                    <div
                      key={evt.id}
                      className={`p-3 rounded-sm border transition-all duration-300 ${
                        fired
                          ? "bg-[#ff8f6f]/5 border-[#ff8f6f]/15"
                          : "bg-[#111] border-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${fired ? "bg-[#ff8f6f]" : "bg-[#252525]"}`} />
                        <span className={`text-[9px] font-mono tabular-nums ${fired ? "text-[#ff8f6f]/60" : "text-[#333]"}`}>
                          +{evt.delayMs / 1000}s
                        </span>
                        <span className={`text-[9px] font-body ${fired ? "text-[#adaaaa]" : "text-[#333]"}`}>
                          {evt.label}
                        </span>
                        {fired && (
                          <span className="ml-auto material-symbols-outlined text-[#ff8f6f]/70 shrink-0" style={{ fontSize: "11px" }}>
                            check_circle
                          </span>
                        )}
                      </div>
                      <div className={`text-[9px] font-mono rounded-sm px-2 py-1.5 bg-[#0a0a0a] leading-relaxed ${fired ? "text-[#3a3939]" : "text-[#222]"}`}>
                        {bodyPreview}…
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Why it's costly */}
              <div className="px-4 pb-4 pt-2 border-t border-white/5 mt-2 space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#3a3939]">Why it&apos;s costly</span>
                <div className="space-y-1.5">
                  {[
                    { icon: "wifi",        text: "Full TCP handshake on every poll" },
                    { icon: "timer",       text: "Latency = up to 1 full interval" },
                    { icon: "trending_up", text: "Server load scales with client count" },
                  ].map(({ icon, text }) => (
                    <div key={icon} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[#2e2e2e] shrink-0 mt-px" style={{ fontSize: "11px", lineHeight: 1.4 }}>{icon}</span>
                      <span className="text-[9px] font-body text-[#2e2e2e] leading-relaxed">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── History (both modes) ── */}
          {pollSessions.length > 0 && (
            <div className="p-4 border-t border-white/5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] block">History</span>
              <div className="space-y-1">
                {pollSessions.slice().reverse().map((s) => {
                  const waste = s.totalRounds > 0
                    ? Math.round(((s.totalRounds - s.dataRounds) / s.totalRounds) * 100)
                    : 0;
                  return (
                    <div key={s.id} className="px-3 py-2 rounded-sm bg-[#1a1919] border border-transparent">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm ${
                          s.mode === "real"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-purple-500/15 text-purple-400"
                        }`}>{s.mode}</span>
                        <span className="text-[9px] font-body text-[#494847]">{s.totalRounds} rounds · {s.intervalMs}ms</span>
                        <span className="ml-auto text-[9px] font-mono text-red-400/70">{waste}% waste</span>
                      </div>
                      {s.url && (
                        <div className="text-[9px] font-mono text-[#333] truncate">{s.url}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  if (appMode === "virtual") {
    return (
      // Virtual: mode toggle + server toggle + route list
      <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-hidden">
        <HttpModeToggle appMode={appMode} onSetAppMode={onSetAppMode} onReset={onReset} />
        {/* Server toggle */}
        <div className="p-4 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575]">Virtual Server</span>
            <button
              onClick={onToggleServer}
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
            onClick={() => onSetEditingRoute({ ...BLANK_ROUTE })}
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
                  <button onClick={() => onTryRoute(route)} className="flex items-center gap-1 text-[9px] font-body text-[#adaaaa] hover:text-[#ff8f6f] transition-colors">
                    <span className="material-symbols-outlined text-xs">play_arrow</span>Try
                  </button>
                  <span className="text-[#262626]">·</span>
                  <button onClick={() => onSetEditingRoute({ ...route })} className="text-[9px] font-body text-[#adaaaa] hover:text-white transition-colors">Edit</button>
                  <span className="text-[#262626]">·</span>
                  <button onClick={() => onDeleteRoute(route.id)} className="text-[9px] font-body text-[#adaaaa] hover:text-red-400 transition-colors">Delete</button>
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
                  <button onClick={() => onSetEditingRoute(null)} className="text-[#494847] hover:text-white text-base leading-none">×</button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={editingRoute.method}
                    onChange={(e) => onSetEditingRoute({ ...editingRoute, method: e.target.value as HttpMethod })}
                    className="bg-[#0e0e0e] border border-white/5 text-[#ff8f6f] text-xs font-black font-body px-2 py-2 rounded-sm focus:outline-none w-24 shrink-0"
                  >
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <input
                    value={editingRoute.path}
                    onChange={(e) => onSetEditingRoute({ ...editingRoute, path: e.target.value })}
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
                      onChange={(e) => onSetEditingRoute({ ...editingRoute, status: parseInt(e.target.value) || 200 })}
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
                      onChange={(e) => onSetEditingRoute({ ...editingRoute, delay: parseInt(e.target.value) })}
                      className="w-full accent-[#ff8f6f] mt-1.5"
                    />
                  </div>
                </div>
                <input
                  value={editingRoute.description ?? ""}
                  onChange={(e) => onSetEditingRoute({ ...editingRoute, description: e.target.value })}
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
                    onChange={(e) => onSetEditingRoute({ ...editingRoute, responseBody: e.target.value })}
                    rows={5}
                    className="w-full bg-[#0e0e0e] border border-white/5 text-[#adaaaa] text-[10px] font-mono px-2 py-2 rounded-sm focus:outline-none focus:border-[#ff8f6f]/30 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onSetEditingRoute(null)} className="flex-1 py-2 text-[10px] font-bold font-body text-[#adaaaa] hover:text-white border border-white/10 rounded-sm transition-colors">Cancel</button>
                  <button onClick={onSaveRoute} className="flex-1 py-2 text-[10px] font-bold font-body bg-[#ff8f6f] text-[#5c1400] rounded-sm hover:bg-[#ff7851] transition-colors">
                    {editingRoute.id ? "Save Changes" : "Add Route"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Real: mode toggle + preset URLs + cert info after request
  return (
    <div className="w-72 shrink-0 border-r border-white/5 bg-[#0e0e0e] flex flex-col overflow-y-auto">
      <HttpModeToggle appMode={appMode} onSetAppMode={onSetAppMode} onReset={onReset} />
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
                onClick={() => { onSetRealUrl(p.url); onSetMethod(p.method); onReset(); }}
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

        {/* History placeholder */}
        <div className="h-px bg-white/5" />
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575]">History</span>
            <span className="text-[9px] font-body text-[#262626] uppercase tracking-widest">Coming soon</span>
          </div>
          <div className="space-y-1">
            {[
              { w: "60%",  method: "GET" },
              { w: "80%",  method: "POST" },
              { w: "50%",  method: "GET" },
              { w: "70%",  method: "DELETE" },
              { w: "65%",  method: "PATCH" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-sm bg-[#1a1919] border border-transparent opacity-30">
                <div className={`text-[9px] font-black font-body shrink-0 ${METHOD_COLORS[item.method as HttpMethod].text}`}>{item.method}</div>
                <div className="h-2 rounded-sm bg-[#262626] animate-pulse" style={{ width: item.w }} />
              </div>
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
  );
}
