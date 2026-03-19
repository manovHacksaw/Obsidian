"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppMode, HttpMethod, SimMode, RealResult, Route } from "../types";
import { METHODS, METHOD_COLORS, METHOD_INFO } from "../constants";

interface RequestBarProps {
  appMode: AppMode;
  method: HttpMethod;
  virtualUrl: string;
  realUrl: string;
  simMode: SimMode;
  isRunning: boolean;
  isDone: boolean;
  waitingStep: boolean;
  validationError: string | null;
  showBody: boolean;
  reqBody: string;
  timeoutSecs: number;
  routes: Route[];
  realResult: RealResult | null;
  onSetMethod: (m: HttpMethod) => void;
  onSetVirtualUrl: (url: string) => void;
  onSetRealUrl: (url: string) => void;
  onSetSimMode: (m: SimMode) => void;
  onRunSimulation: () => void;
  onAdvanceStep: () => void;
  onCancelRequest: () => void;
  onReset: () => void;
  onSetShowBody: (fn: (s: boolean) => boolean) => void;
  onSetReqBody: (body: string) => void;
  onSetTimeoutSecs: (s: number) => void;
  onTryRoute: (route: Route) => void;
}

export function RequestBar({
  appMode,
  method,
  virtualUrl,
  realUrl,
  simMode,
  isRunning,
  isDone,
  waitingStep,
  validationError,
  showBody,
  reqBody,
  timeoutSecs,
  routes,
  realResult,
  onSetMethod,
  onSetVirtualUrl,
  onSetRealUrl,
  onSetSimMode,
  onRunSimulation,
  onAdvanceStep,
  onCancelRequest,
  onReset,
  onSetShowBody,
  onSetReqBody,
  onSetTimeoutSecs,
  onTryRoute,
}: RequestBarProps) {
  const mc = METHOD_COLORS[method];

  return (
    <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] px-4 pt-4 pb-3 space-y-2.5">

      {/* ── Unified input bar ── */}
      <div className={`flex items-stretch rounded-sm border overflow-hidden transition-colors duration-150 ${
        validationError ? "border-red-500/25" : "border-white/8 focus-within:border-white/16"
      }`}>

        {/* Method selector */}
        <div className="relative shrink-0">
          <select
            value={method}
            onChange={(e) => onSetMethod(e.target.value as HttpMethod)}
            className={`h-full appearance-none bg-[#111] border-r border-white/8 pl-3 pr-7 text-xs font-black font-body cursor-pointer focus:outline-none ${mc.text}`}
            style={{ minWidth: "72px" }}
          >
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
          {/* dropdown chevron */}
          <span
            className={`material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 ${mc.text}`}
            style={{ fontSize: "13px", lineHeight: 1 }}
          >expand_more</span>
        </div>

        {/* URL input */}
        {appMode === "virtual" ? (
          <input
            value={virtualUrl}
            onChange={(e) => onSetVirtualUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !isRunning && !validationError) onRunSimulation(); }}
            className="flex-1 bg-[#0d0d0d] text-white text-sm font-mono px-4 py-3 focus:outline-none min-w-0 placeholder:text-[#2e2e2e]"
            placeholder="/api/endpoint"
          />
        ) : (
          <input
            value={realUrl}
            onChange={(e) => onSetRealUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !isRunning && !validationError) onRunSimulation(); }}
            className="flex-1 bg-[#0d0d0d] text-white text-sm font-mono px-4 py-3 focus:outline-none min-w-0 placeholder:text-[#2e2e2e]"
            placeholder="https://example.com/api/endpoint"
          />
        )}

        {/* Sim mode toggle — virtual only */}
        {appMode === "virtual" && (
          <div className="flex items-stretch border-l border-white/8 shrink-0">
            {(["auto", "step"] as SimMode[]).map((m) => (
              <button
                key={m}
                onClick={() => onSetSimMode(m)}
                className={`px-3 text-[9px] font-bold font-body uppercase tracking-widest transition-colors ${
                  simMode === m ? "bg-[#ff8f6f]/10 text-[#ff8f6f]" : "bg-transparent text-[#494847] hover:text-[#adaaaa]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Divider before CTA */}
        <div className="w-px bg-white/8 shrink-0" />

        {/* Send / Next / Cancel CTA */}
        {appMode === "virtual" && simMode === "step" && waitingStep && isRunning ? (
          <button
            onClick={onAdvanceStep}
            className="px-5 bg-[#1a1919] text-[#ff8f6f] font-headline font-bold text-sm flex items-center gap-2 hover:bg-[#201f1f] transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-base">skip_next</span>
            Next
          </button>
        ) : isRunning ? (
          <button
            onClick={appMode === "real" ? onCancelRequest : undefined}
            className={`px-5 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-colors ${
              appMode === "real"
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "bg-[#1a1919] text-[#494847] cursor-default"
            }`}
          >
            {appMode === "real" ? (
              <>
                <span className="material-symbols-outlined text-base">stop_circle</span>
                Cancel
              </>
            ) : (
              <>
                <motion.span
                  className="material-symbols-outlined text-base text-[#ff8f6f]"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >refresh</motion.span>
                Sending
              </>
            )}
          </button>
        ) : (
          <button
            onClick={validationError ? undefined : onRunSimulation}
            disabled={!!validationError}
            title={validationError ?? undefined}
            className={`px-6 font-headline font-bold text-sm flex items-center gap-2 shrink-0 transition-all duration-150 ${
              validationError
                ? "bg-[#1a1919] text-[#3a3939] cursor-not-allowed"
                : "bg-[#ff8f6f] text-[#5c1400] hover:bg-[#ff7851] active:scale-[0.98] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            }`}
          >
            <span className="material-symbols-outlined text-base">send</span>
            Send
          </button>
        )}
      </div>

      {/* ── Sub-bar: hint / error · controls ── */}
      <div className="flex items-center gap-4 min-w-0 px-2">

        {/* Left: validation error or method hint */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {validationError ? (
            <>
              <span className="material-symbols-outlined text-red-400/70 shrink-0" style={{ fontSize: "12px", lineHeight: 1 }}>error</span>
              <span className="text-[10px] font-body text-red-400/70 truncate">{validationError}</span>
            </>
          ) : (
            <span className="text-[10px] font-body text-[#3a3939] truncate">
              <span className={`font-bold mr-1 ${mc.text}`}>{method}</span>
              — {METHOD_INFO[method].hint}
            </span>
          )}
        </div>

        {/* Right: controls row */}
        <div className="flex items-center gap-3 shrink-0">

          {/* Timeout — real mode, not running */}
          {appMode === "real" && !isRunning && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold font-body uppercase tracking-[0.15em] text-[#494847]">Timeout</span>
              <div className="flex items-center bg-[#111] border border-white/8 rounded-sm overflow-hidden">
                {[15, 30, 60, 120].map((s) => (
                  <button
                    key={s}
                    onClick={() => onSetTimeoutSecs(s)}
                    title={`Abort request after ${s} seconds`}
                    className={`px-2 py-1 text-[9px] font-bold font-mono transition-colors border-r border-white/5 last:border-r-0 ${
                      timeoutSecs === s
                        ? "bg-[#ff8f6f]/12 text-[#ff8f6f]"
                        : "text-[#494847] hover:text-[#adaaaa]"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
               
              </div>
            </div>
          )}

          {/* Timing strip — real mode, after request */}
          {appMode === "real" && realResult && !isRunning && (
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#494847]">
              <span className="text-blue-400/70">{realResult.dns.duration}ms</span>
              <span className="text-[#262626]">·</span>
              <span className="text-purple-400/70">{realResult.tcp.duration}ms</span>
              {realResult.tls && <><span className="text-[#262626]">·</span><span className="text-yellow-400/70">{realResult.tls.duration}ms</span></>}
              <span className="text-[#262626]">·</span>
              <span className="text-[#ff8f6f]/70">{realResult.ttfb.duration}ms</span>
            </div>
          )}

          {/* Body toggle */}
          <button
            onClick={() => onSetShowBody((s) => !s)}
            className={`flex items-center gap-1 text-[9px] font-body transition-colors ${
              showBody ? "text-[#ff8f6f]" : "text-[#494847] hover:text-[#adaaaa]"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "13px", lineHeight: 1 }}>
              {showBody ? "keyboard_arrow_up" : "data_object"}
            </span>
            {showBody ? "Hide body" : "Body"}
          </button>

          {/* Virtual quick-route pills */}
          {appMode === "virtual" && (
            <div className="flex gap-1 overflow-x-auto max-w-48">
              {routes.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onTryRoute(r)}
                  className={`text-[9px] font-body px-2 py-0.5 rounded-sm whitespace-nowrap transition-colors border shrink-0 ${METHOD_COLORS[r.method].text} ${METHOD_COLORS[r.method].bg} ${METHOD_COLORS[r.method].border}`}
                >
                  {r.method} {r.path}
                </button>
              ))}
            </div>
          )}

          {/* Reset */}
          {isDone && !isRunning && (
            <button
              onClick={onReset}
              className="text-[9px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "12px", lineHeight: 1 }}>refresh</span>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Body editor ── */}
      <AnimatePresence>
        {showBody && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="rounded-sm border border-white/8 overflow-hidden focus-within:border-white/15 transition-colors">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111] border-b border-white/5">
                <span className="text-[9px] font-bold font-body uppercase tracking-[0.2em] text-[#3a3939]">Request Body</span>
                <span className="text-[9px] font-body text-[#3a3939]">· JSON</span>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    try { onSetReqBody(JSON.stringify(JSON.parse(reqBody), null, 2)); } catch { /* not JSON */ }
                  }}
                  className="text-[9px] font-bold font-body uppercase tracking-widest text-[#494847] hover:text-[#ff8f6f] transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "11px", lineHeight: 1 }}>data_object</span>
                  Format
                </button>
                <div className="w-px h-3 bg-white/8" />
                <button
                  onClick={() => onSetReqBody("")}
                  className="text-[9px] font-bold font-body uppercase tracking-widest text-[#494847] hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "11px", lineHeight: 1 }}>close</span>
                  Clear
                </button>
              </div>
              <textarea
                value={reqBody}
                onChange={(e) => onSetReqBody(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={'{\n  "key": "value"\n}'}
                className="w-full bg-[#0a0a0a] text-[#adaaaa] text-xs font-mono px-4 py-3 focus:outline-none resize-none leading-relaxed placeholder:text-[#1e1e1e]"
              />
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#111] border-t border-white/5">
                <span className="text-[9px] font-body text-[#3a3939]">
                  {reqBody.trim() ? `${new Blob([reqBody]).size} bytes` : "empty body"}
                </span>
                {(() => {
                  try {
                    JSON.parse(reqBody);
                    return (
                      <span className="text-[9px] font-body text-green-500/60 flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: "10px", lineHeight: 1 }}>check_circle</span>
                        Valid JSON
                      </span>
                    );
                  } catch {
                    return reqBody.trim() ? (
                      <span className="text-[9px] font-body text-red-400/60 flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: "10px", lineHeight: 1 }}>error</span>
                        Invalid JSON
                      </span>
                    ) : null;
                  }
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
