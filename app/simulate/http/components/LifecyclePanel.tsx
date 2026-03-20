"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppMode, HttpMethod, StageResult, RealResult, ResponseState } from "../types";
import {
  STAGE_DEFS,
  STAGE_BAR_COLORS,
  STAGE_TEXT_COLORS,
  STATUS_TEXT,
  statusColor,
} from "../constants";
import { StageCard } from "./StageCard";

interface LifecyclePanelProps {
  appMode: AppMode;
  method: HttpMethod;
  virtualUrl: string;
  realUrl: string;
  reqBody: string;
  viewMode: "visual" | "raw";
  stages: StageResult[];
  currentIdx: number;
  isRunning: boolean;
  isDone: boolean;
  simError: string | null;
  stageData: Record<string, Record<string, unknown>>;
  donedStages: StageResult[];
  serverRunning: boolean;
  realResult: RealResult | null;
  response: ResponseState | null;
}

export function LifecyclePanel({
  appMode,
  method,
  virtualUrl,
  realUrl,
  reqBody,
  viewMode,
  stages,
  currentIdx,
  isRunning,
  isDone,
  simError,
  stageData,
  donedStages,
  serverRunning,
  realResult,
  response,
}: LifecyclePanelProps) {
  return (
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
              return (
                <StageCard
                  key={def.id}
                  def={def}
                  index={i}
                  currentIdx={currentIdx}
                  result={result}
                  appMode={appMode}
                  realUrl={realUrl}
                  stageData={stageData}
                  simError={simError}
                />
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
  );
}
