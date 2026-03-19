"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RealResult } from "../types";
import { STATUS_TEXT, statusColor } from "../constants";
import { InspectSection, InspectRow } from "./InspectSection";

interface InspectOverlayProps {
  expandedBody: boolean;
  realResult: RealResult | null;
  realUrl: string;
  bodyPretty: boolean;
  bodyCopied: boolean;
  onClose: () => void;
  onSetBodyPretty: (fn: (p: boolean) => boolean) => void;
  onSetBodyCopied: (copied: boolean) => void;
}

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export function InspectOverlay({
  expandedBody,
  realResult,
  realUrl,
  bodyPretty,
  bodyCopied,
  onClose,
  onSetBodyPretty,
  onSetBodyCopied,
}: InspectOverlayProps) {
  return (
    <AnimatePresence>
      {expandedBody && realResult && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            className="fixed inset-0 z-50 bg-[#0e0e0e] border border-white/8 flex flex-col"
            style={{ boxShadow: "0 0 0 1px rgba(255,143,111,0.06), 0 32px 80px rgba(0,0,0,0.8)" }}
          >
          {/* Overlay header */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.06, ease: "easeOut" }}
            className="flex items-center justify-between px-8 py-4 border-b border-white/5 shrink-0"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#ff8f6f] text-lg">network_check</span>
              <span className="font-headline font-bold text-sm uppercase tracking-widest text-white">Request Inspection</span>
              <span className="text-[10px] font-mono text-[#494847] border border-white/5 px-2 py-0.5 rounded-sm">{realUrl}</span>
            </div>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-[#adaaaa] hover:text-white transition-colors text-sm font-body"
            >
              <span className="material-symbols-outlined text-base">close</span>
              Close
            </button>
          </motion.div>

          {/* Overlay content */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: 0.1, ease: "easeOut" }}
            className="flex-1 flex overflow-hidden min-h-0"
          >

            {/* LEFT column — Request Lifecycle */}
            <div className="flex-1 overflow-y-auto px-8 py-6 border-r border-white/5">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] mb-6">Request Lifecycle</h2>

              <InspectSection
                step="01" label="DNS Resolution" icon="travel_explore"
                duration={realResult.dns.duration}
                color="text-blue-400" borderColor="border-blue-500/20"
              >
                <InspectRow k="query type" v="A record (IPv4)" />
                <InspectRow k="hostname" v={realResult.dns.hostname} />
                <InspectRow k="resolved ip" v={realResult.dns.ip} accent />
                <InspectRow k="resolver" v="OS stub resolver (system DNS)" />
                <InspectRow
                  k="cache hint"
                  v={realResult.dns.duration <= 5 ? "< 5ms — likely served from OS or local cache" : `${realResult.dns.duration}ms — full recursive lookup performed`}
                  accent={realResult.dns.duration <= 5}
                />
              </InspectSection>

              <InspectSection
                step="02" label="TCP 3-Way Handshake" icon="cable"
                duration={realResult.tcp.duration}
                color="text-purple-400" borderColor="border-purple-500/20"
              >
                <InspectRow k="target" v={`${realResult.dns.ip}:${realUrl.startsWith("https") ? "443" : "80"}`} accent />
                <div className="mt-3 space-y-1.5 pl-1">
                  {[
                    { dir: "→", label: "SYN", note: "client initiates connection, sets sequence number" },
                    { dir: "←", label: "SYN-ACK", note: "server acknowledges, sends its own sequence number" },
                    { dir: "→", label: "ACK", note: "client acknowledges — connection established" },
                  ].map(({ dir, label, note }) => (
                    <div key={label} className="flex items-start gap-3 font-mono text-[10px]">
                      <span className={`shrink-0 font-bold w-4 ${dir === "→" ? "text-[#ff8f6f]" : "text-blue-400"}`}>{dir}</span>
                      <span className="text-white w-16 shrink-0">{label}</span>
                      <span className="text-[#494847]">{note}</span>
                    </div>
                  ))}
                </div>
                <InspectRow k="total rtt" v={`${realResult.tcp.duration}ms`} accent />
              </InspectSection>

              {realResult.tls ? (
                <InspectSection
                  step="03" label="TLS Handshake" icon="lock"
                  duration={realResult.tls.duration}
                  color="text-yellow-400" borderColor="border-yellow-500/20"
                >
                  <div className="mt-3 space-y-1.5 pl-1">
                    {[
                      { dir: "→", label: "ClientHello", note: "supported cipher suites, TLS version, random nonce" },
                      { dir: "←", label: "ServerHello", note: "chosen cipher, key share, server random" },
                      { dir: "←", label: "Certificate", note: "server cert chain for identity verification" },
                      { dir: "←", label: "Finished", note: "server HMAC — handshake integrity proof" },
                      { dir: "→", label: "Finished", note: "client HMAC — encrypted channel established" },
                    ].map(({ dir, label, note }, idx) => (
                      <div key={idx} className="flex items-start gap-3 font-mono text-[10px]">
                        <span className={`shrink-0 font-bold w-4 ${dir === "→" ? "text-[#ff8f6f]" : "text-blue-400"}`}>{dir}</span>
                        <span className="text-white w-24 shrink-0">{label}</span>
                        <span className="text-[#494847]">{note}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-white/5 pt-3 space-y-0">
                    <InspectRow k="protocol" v={realResult.tls.version} accent />
                    <InspectRow k="cipher" v={realResult.tls.cipher} />
                    <InspectRow k="subject" v={realResult.tls.cert.subject} />
                    <InspectRow k="issuer" v={realResult.tls.cert.issuer} />
                    <InspectRow k="valid from" v={realResult.tls.cert.validFrom} />
                    <InspectRow k="valid until" v={realResult.tls.cert.validTo} />
                    <InspectRow k="fingerprint" v={realResult.tls.cert.fingerprint} />
                  </div>
                </InspectSection>
              ) : (
                <div className="relative pl-14 pb-6 opacity-30">
                  <div className="absolute left-0 top-0 w-9 h-9 rounded-sm bg-[#111] border border-white/5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#494847]" style={{ fontSize: "18px", lineHeight: 1 }}>remove</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[9px] font-body text-[#494847] uppercase tracking-widest">03</span>
                    <div className="text-sm font-bold font-body text-[#494847]">TLS — skipped (plain HTTP)</div>
                  </div>
                </div>
              )}

              <InspectSection
                step="04" label="HTTP Request" icon="upload"
                duration={realResult.request.duration}
                color="text-orange-400" borderColor="border-orange-500/20"
              >
                <pre className="mt-3 text-[10px] font-mono leading-relaxed overflow-x-auto">
                  <span className="text-[#ff8f6f] font-bold">{realResult.request.raw.split("\r\n")[0]}</span>
                  {"\n"}
                  <span className="text-[#adaaaa]">{realResult.request.raw.split("\r\n").slice(1).join("\n")}</span>
                </pre>
              </InspectSection>

              <InspectSection
                step="05" label="Server Processing (TTFB)" icon="memory"
                duration={realResult.ttfb.duration}
                color="text-[#ff8f6f]" borderColor="border-[#ff8f6f]/20"
              >
                <InspectRow k="time to first byte" v={`${realResult.ttfb.duration}ms`} accent />
                <InspectRow k="what this covers" v="server receives request → app logic → database → first byte of response sent" />
              </InspectSection>

              {/* Total time row */}
              <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-body uppercase tracking-[0.2em] text-[#494847]">Total request time</span>
                <span className="text-2xl font-black font-headline text-[#ff8f6f] tabular-nums">{realResult.total}ms</span>
              </div>
            </div>

            {/* RIGHT column — Response */}
            <div className="w-[420px] shrink-0 overflow-y-auto px-8 py-6">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] mb-6">Response</h2>

              {/* Status code */}
              <div className="mb-6">
                <div className={`text-5xl font-black font-headline tabular-nums leading-none ${statusColor(realResult.response.status)}`}>
                  {realResult.response.status}
                </div>
                <div className={`text-sm font-bold font-body mt-1 ${statusColor(realResult.response.status)}`}>
                  {STATUS_TEXT[realResult.response.status] ?? realResult.response.statusText}
                </div>
                <div className="text-[10px] font-body text-[#777575] mt-2 leading-relaxed max-w-xs">
                  {({
                    200: "The request succeeded. The server found the resource and returned it in the response body.",
                    201: "A new resource was created as a result of the request. Check the Location header for its URL.",
                    204: "The request succeeded but there is no content to return. Common after DELETE or PUT.",
                    301: "The resource has permanently moved to a new URL. Clients should update their bookmarks.",
                    302: "Temporary redirect. The resource is at a different URL for now, but may return.",
                    304: "Not modified. The cached version is still valid — no body is sent to save bandwidth.",
                    400: "Bad request. The server could not understand the request due to malformed syntax or invalid parameters.",
                    401: "Unauthenticated. Valid credentials are required to access this resource.",
                    403: "Forbidden. The server understood the request but refuses to authorise it.",
                    404: "Not found. The server could not locate the requested resource at this URL.",
                    429: "Too many requests. The client has exceeded the rate limit — slow down and retry later.",
                    500: "Internal server error. Something went wrong on the server while processing the request.",
                    502: "Bad gateway. The server received an invalid response from an upstream service.",
                    503: "Service unavailable. The server is temporarily overloaded or under maintenance.",
                  } as Record<number, string>)[realResult.response.status] ?? (
                    realResult.response.status >= 500 ? "Server-side error — the server failed to fulfil a valid request."
                    : realResult.response.status >= 400 ? "Client error — the request could not be processed as sent."
                    : realResult.response.status >= 300 ? "Redirect — follow the Location header to the resource."
                    : "Success — the request was received, understood, and accepted."
                  )}
                </div>
              </div>

              {/* Download info */}
              <div className="mb-6 px-3 py-2.5 bg-[#1a1919] rounded-sm border border-white/5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#494847] mb-1">Transfer</div>
                <div className="text-[10px] font-mono text-[#adaaaa]">
                  {realResult.download.bytes.toLocaleString()} bytes in {realResult.download.duration}ms
                </div>
              </div>

              {/* Headers */}
              <div className="mb-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575] mb-2">Headers</div>
                <div className="rounded-sm overflow-hidden border border-white/5">
                  {Object.entries(realResult.response.headers).map(([k, v], i) => (
                    <div
                      key={k}
                      className={`flex items-baseline gap-3 px-3 py-1.5 font-mono text-[10px] ${i % 2 === 0 ? "bg-[#111]" : "bg-transparent"}`}
                    >
                      <span className="text-[#ff8f6f] w-40 shrink-0 truncate">{k}</span>
                      <span className="text-[#777575] break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Body */}
              {realResult.response.body && (() => {
                let formatted = realResult.response.body;
                let isJson = false;
                try { formatted = JSON.stringify(JSON.parse(realResult.response.body), null, 2); isJson = true; } catch { /* not JSON */ }
                const displayed = (bodyPretty && isJson) ? formatted : realResult.response.body;
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#777575]">Body</div>
                      <div className="flex items-center gap-1">
                        {isJson && (
                          <button
                            onClick={() => onSetBodyPretty(p => !p)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold font-body uppercase tracking-widest border transition-colors ${bodyPretty ? "bg-[#ff8f6f]/10 border-[#ff8f6f]/30 text-[#ff8f6f]" : "bg-transparent border-white/10 text-[#777575] hover:text-white"}`}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "12px", lineHeight: 1 }}>data_object</span>
                            {bodyPretty ? "Raw" : "Format"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(displayed);
                            onSetBodyCopied(true);
                            setTimeout(() => onSetBodyCopied(false), 2000);
                          }}
                          className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold font-body uppercase tracking-widest border transition-colors ${bodyCopied ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-transparent border-white/10 text-[#777575] hover:text-white"}`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "12px", lineHeight: 1 }}>{bodyCopied ? "check" : "content_copy"}</span>
                          {bodyCopied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <pre className="bg-[#1a1919] border border-white/5 rounded-sm p-3 text-[10px] font-mono text-[#adaaaa] whitespace-pre-wrap break-all leading-relaxed overflow-x-auto">
                      {displayed}
                    </pre>
                  </div>
                );
              })()}
            </div>

          </motion.div>
        </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
