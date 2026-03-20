"use client";

import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppMode, HttpMethod, RealResult, ResponseState } from "../types";
import { STATUS_TEXT, statusColor } from "../constants";
import { BodyInspector } from "./BodyInspector";

interface ResponsePanelProps {
  appMode: AppMode;
  method: HttpMethod;
  virtualUrl: string;
  isDone: boolean;
  isRunning: boolean;
  simError: string | null;
  response: ResponseState | null;
  realResult: RealResult | null;
  respTab: "body" | "headers" | "raw";
  bodyPretty: boolean;
  bodyCopied: boolean;
  rightWidth: number;
  expandedBody: boolean;
  onSetRespTab: (tab: "body" | "headers" | "raw") => void;
  onSetBodyPretty: (fn: (p: boolean) => boolean) => void;
  onSetBodyCopied: (copied: boolean) => void;
  onSetExpandedBody: (expanded: boolean) => void;
  onShowLifecycle: () => void;
  onDragHandleMouseDown: (e: React.MouseEvent) => void;
}

const MIN_BODY_H = 80;
const DEFAULT_BODY_H = 220;

export function ResponsePanel({
  appMode,
  method,
  virtualUrl,
  isDone,
  isRunning,
  simError,
  response,
  realResult,
  respTab,
  bodyPretty,
  bodyCopied,
  rightWidth,
  expandedBody,
  onSetRespTab,
  onSetBodyPretty,
  onSetBodyCopied,
  onSetExpandedBody,
  onShowLifecycle,
  onDragHandleMouseDown,
}: ResponsePanelProps) {
  const [bodyHeight, setBodyHeight] = useState(DEFAULT_BODY_H);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleBodyResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: bodyHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      setBodyHeight(Math.max(MIN_BODY_H, dragRef.current.startH + delta));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [bodyHeight]);

  // Are we currently showing the inline inspector?
  const showingInspector = expandedBody && isDone && !!response?.body;

  return (
    <div className="shrink-0 flex bg-[#0e0e0e]" style={{ width: rightWidth }}>
      {/* Left drag handle (panel resize) */}
      <div
        className="w-1 shrink-0 cursor-col-resize group relative flex items-center justify-center border-l border-white/5 hover:border-[#ff8f6f]/40 transition-colors"
        onMouseDown={onDragHandleMouseDown}
      >
        <div className="w-px h-8 bg-[#262626] group-hover:bg-[#ff8f6f]/40 transition-colors rounded-full" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Sticky status bar ─────────────────────────────────────── */}
        <div className="shrink-0 px-4 py-2.5 border-b border-white/5 bg-[#0a0a0a] flex items-center gap-3">
          {isDone && response ? (
            <>
              <span className={`text-lg font-black font-headline tabular-nums leading-none ${statusColor(response.status)}`}>
                {response.status}
              </span>
              <span className={`text-[10px] font-bold font-body ${statusColor(response.status)}`}>
                {STATUS_TEXT[response.status] ?? realResult?.response.statusText ?? ""}
              </span>
              <div className="flex-1" />
              <span className="text-[9px] font-mono text-[#494847]">{response.totalTime}ms</span>
              {/* Lifecycle shortcut — real mode only */}
              {appMode === "real" && realResult && (
                <motion.button
                  onClick={onShowLifecycle}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="relative flex items-center gap-1.5 text-[8px] font-bold font-body uppercase tracking-widest text-[#ff8f6f]/70 hover:text-[#ff8f6f] transition-colors border border-[#ff8f6f]/15 hover:border-[#ff8f6f]/40 px-1.5 py-0.5 rounded-sm hover:bg-[#ff8f6f]/5"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "11px", lineHeight: 1 }}>ssid_chart</span>
                  Lifecycle
                </motion.button>
              )}
            </>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#494847]">Response</span>
          )}
        </div>

        {/* ── Tabs (hidden in inspector mode) ───────────────────────── */}
        <AnimatePresence>
          {!showingInspector && isDone && response && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="shrink-0 flex border-b border-white/5 bg-[#0a0a0a] overflow-hidden"
            >
              {(["body", "headers", "raw"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onSetRespTab(tab)}
                  className={`px-4 py-2 text-[10px] font-bold font-body uppercase tracking-widest transition-colors border-b-2 ${
                    respTab === tab
                      ? "text-[#ff8f6f] border-[#ff8f6f]"
                      : "text-[#494847] border-transparent hover:text-[#adaaaa]"
                  }`}
                >
                  {tab}
                  {tab === "headers" && (
                    <span className="ml-1.5 text-[8px] text-[#494847]">
                      {Object.keys(response.headers).length}
                    </span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main content area — switches between normal and inspector ── */}
        <AnimatePresence mode="wait">

          {/* ── Inspector mode ───────────────────────────────────────── */}
          {showingInspector && (
            <motion.div
              key="inspector"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 flex flex-col p-2"
            >
              <BodyInspector
                body={response!.body}
                status={response!.status}
                totalTime={response!.totalTime}
                downloadBytes={realResult?.download.bytes}
                onClose={() => onSetExpandedBody(false)}
              />
            </motion.div>
          )}

          {/* ── Normal mode ──────────────────────────────────────────── */}
          {!showingInspector && (
            <motion.div
              key="normal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 overflow-y-auto min-w-0"
            >
              <div className="p-4">

                {/* Empty state */}
                {!isDone && !isRunning && (
                  <div className="flex flex-col items-center gap-3 py-12 opacity-20">
                    <span className="material-symbols-outlined text-3xl text-[#adaaaa]">hourglass_empty</span>
                    <p className="text-[10px] font-body text-[#adaaaa] text-center">Hit Send to see response</p>
                  </div>
                )}

                {/* Skeleton */}
                {isRunning && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between p-3 bg-[#1a1919] rounded-sm border border-white/5">
                      <div className="h-7 w-12 bg-[#262626] rounded-sm animate-pulse" />
                      <div className="space-y-1.5 text-right">
                        <div className="h-2.5 w-8 bg-[#262626] rounded-sm animate-pulse ml-auto" />
                        <div className="h-2 w-10 bg-[#1f1f1f] rounded-sm animate-pulse ml-auto" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-1.5 w-12 bg-[#262626] rounded-sm animate-pulse mb-2" />
                      {[28, 40, 22, 36, 30, 44].map((w) => (
                        <div key={w} className="flex gap-2">
                          <div className="h-2 w-16 bg-[#1f1f1f] rounded-sm animate-pulse shrink-0" />
                          <div className="h-2 bg-[#1a1919] rounded-sm animate-pulse" style={{ width: `${w * 3}px` }} />
                        </div>
                      ))}
                    </div>
                    <div className="bg-[#1a1919] border border-white/5 rounded-sm p-3 space-y-1.5">
                      {[60, 80, 70, 55, 65].map((w) => (
                        <div key={w} className="h-2 bg-[#1f1f1f] rounded-sm animate-pulse" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {isDone && simError && !response && (
                  <div className="rounded-sm border border-white/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1919] border-b border-white/5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" style={{ boxShadow: "0 0 6px rgba(248,113,113,0.5)" }} />
                      <span className="text-[10px] font-bold font-body uppercase tracking-[0.2em] text-[#777575]">Request Failed</span>
                    </div>
                    <div className="px-4 py-4 bg-[#0e0e0e] space-y-3">
                      <p className="text-sm font-body text-[#adaaaa] leading-relaxed">{simError}</p>
                      <div className="flex items-center gap-2 text-[9px] font-body text-[#494847] uppercase tracking-widest">
                        <span className="material-symbols-outlined text-[#494847]" style={{ fontSize: "11px", lineHeight: 1 }}>info</span>
                        Check the URL, method, and network connectivity
                      </div>
                    </div>
                  </div>
                )}

                {/* Response content */}
                {isDone && response && (() => {
                  let fmt = response.body;
                  let isJson = false;
                  try { fmt = JSON.stringify(JSON.parse(response.body), null, 2); isJson = true; } catch { /* not JSON */ }
                  const displayed = (bodyPretty && isJson) ? fmt : response.body;

                  return (
                    <div>
                      {/* ── BODY tab ── */}
                      {respTab === "body" && (
                        <div className="space-y-2">
                          {response.body ? (
                            <>
                              {/* Action bar */}
                              <div className="flex items-center justify-end gap-3">
                                {isJson && (
                                  <button
                                    onClick={() => onSetBodyPretty(p => !p)}
                                    className={`flex items-center gap-1 text-[9px] font-body transition-colors ${bodyPretty ? "text-[#ff8f6f]" : "text-[#494847] hover:text-[#adaaaa]"}`}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: "13px", lineHeight: 1 }}>data_object</span>
                                    {bodyPretty ? "Raw" : "Format"}
                                  </button>
                                )}
                                <button
                                  onClick={() => { navigator.clipboard.writeText(displayed); onSetBodyCopied(true); setTimeout(() => onSetBodyCopied(false), 2000); }}
                                  className={`flex items-center gap-1 text-[9px] font-body transition-colors ${bodyCopied ? "text-green-400" : "text-[#494847] hover:text-[#adaaaa]"}`}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: "13px", lineHeight: 1 }}>{bodyCopied ? "check" : "content_copy"}</span>
                                  {bodyCopied ? "Copied" : "Copy"}
                                </button>
                                <button
                                  onClick={() => onSetExpandedBody(true)}
                                  className="flex items-center gap-1 text-[9px] font-body text-[#494847] hover:text-[#ff8f6f] transition-colors"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: "13px", lineHeight: 1 }}>open_in_full</span>
                                  Inspect
                                </button>
                              </div>

                              {/* Resizable body block */}
                              <div className="relative rounded-sm border border-white/5 overflow-hidden bg-[#111]">
                                <pre
                                  className="text-[10px] text-[#adaaaa] font-mono p-3 overflow-auto leading-relaxed"
                                  style={{ height: bodyHeight }}
                                >
                                  {displayed}
                                </pre>
                                {/* Drag-to-resize handle */}
                                <div
                                  onMouseDown={handleBodyResizeMouseDown}
                                  className="group flex items-center justify-center h-3 bg-[#0d0d0d] border-t border-white/5 cursor-ns-resize hover:border-[#ff8f6f]/30 transition-colors select-none"
                                >
                                  <div className="w-8 h-px bg-[#262626] group-hover:bg-[#ff8f6f]/40 rounded-full transition-colors" />
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-2 py-8 opacity-30">
                              <span className="material-symbols-outlined text-2xl text-[#adaaaa]">inbox</span>
                              <p className="text-[10px] font-body text-[#adaaaa]">No body</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Meta: bytes · ms */}
                      <div className="flex items-center gap-2 text-[9px] font-mono text-[#494847] mt-3">
                        {appMode === "real" && realResult ? (
                          <>
                            <span>{realResult.download.bytes.toLocaleString()} bytes</span>
                            <span className="text-[#262626]">·</span>
                            <span>{realResult.download.duration}ms</span>
                          </>
                        ) : response.matchedRoute ? (
                          <span className="text-[#ff8f6f]/60 bg-[#ff8f6f]/8 border border-[#ff8f6f]/15 px-2 py-0.5 rounded-sm font-body text-[9px]">
                            {response.matchedRoute}
                          </span>
                        ) : !response.matchedRoute && response.status === 404 && appMode === "virtual" ? (
                          <span className="text-yellow-400/60">No route matched {method} {virtualUrl}</span>
                        ) : null}
                      </div>

                      {/* ── HEADERS tab ── */}
                      {respTab === "headers" && (
                        <div className="rounded-sm overflow-hidden border border-white/5">
                          {Object.entries(response.headers).map(([k, v], i) => (
                            <div
                              key={k}
                              className={`flex items-baseline gap-3 px-3 py-2 font-mono text-[10px] ${i % 2 === 0 ? "bg-[#111]" : "bg-transparent"}`}
                            >
                              <span className="text-[#ff8f6f] w-36 shrink-0 truncate">{k}</span>
                              <span className="text-[#777575] break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── RAW tab ── */}
                      {respTab === "raw" && (
                        <pre className="bg-[#111] border border-white/5 rounded-sm p-3 text-[10px] font-mono overflow-x-auto leading-relaxed">
                          <span className={`font-bold ${statusColor(response.status)}`}>
                            {`HTTP/1.1 ${response.status} ${STATUS_TEXT[response.status] ?? ""}\n`}
                          </span>
                          {Object.entries(response.headers).map(([k, v]) => (
                            <span key={k} className="text-[#adaaaa]">{`${k}: ${v}\n`}</span>
                          ))}
                          {"\n"}
                          <span className="text-white">{response.body}</span>
                        </pre>
                      )}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
