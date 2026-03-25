"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────

type AppMode    = "virtual" | "real";
type ConnState  = "idle" | "connecting" | "connected" | "error";
type StepStatus = "pending" | "active" | "done" | "error";

interface LifecycleStep {
  id:         string;
  label:      string;
  status:     StepStatus;
  durationMs: number | null;
}

interface HandshakeRequest {
  raw:     string;
  key:     string;
  headers: Record<string, string>;
}

interface HandshakeResponse {
  raw:        string;
  statusCode: number;
  accept:     string;
  derivation: {
    key:     string;
    guid:    string;
    input:   string;
    sha1Hex: string;
    accept:  string;
  };
  elapsedMs: number;
}

// ── Constants ─────────────────────────────────────────────────────

const PRESETS: Record<AppMode, string> = {
  virtual: "ws://localhost (loopback demo)",
  real:    "wss://ws.postman-echo.com/raw",
};

const STEP_ICONS: Record<string, string> = {
  dns: "language",
  tcp: "cable",
  tls: "lock",
};

// Headers that actually matter for the upgrade — everything else is noise.
const KEY_HEADERS = [
  "Upgrade",
  "Connection",
  "Sec-WebSocket-Key",
  "Sec-WebSocket-Accept",
  "Sec-WebSocket-Version",
];

const KEY_HEADER_TIPS: Record<string, string> = {
  "Upgrade":               "tells the server which protocol to switch to",
  "Connection":            "required alongside Upgrade to signal intent",
  "Sec-WebSocket-Key":     "random 16-byte nonce — base64-encoded",
  "Sec-WebSocket-Accept":  "SHA-1(key + GUID) — proves server read the request",
  "Sec-WebSocket-Version": "always 13 (RFC 6455)",
};

// ── Lifecycle steps bar ────────────────────────────────────────────

function LifecycleSteps({ steps }: { steps: LifecycleStep[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-0">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] border transition-all duration-300 ${
            step.status === "done"   ? "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.04]" :
            step.status === "active" ? "border-[#ff8f6f]/30 bg-[#ff8f6f]/[0.05]" :
            step.status === "error"  ? "border-red-500/20  bg-red-500/[0.04]"    :
            "border-white/[0.04] bg-transparent"
          }`}>
            <span
              className={`material-symbols-outlined transition-colors ${
                step.status === "done"   ? "text-[#6ee7b7]" :
                step.status === "active" ? "text-[#ff8f6f]" :
                step.status === "error"  ? "text-red-400"   :
                "text-[#2a2a2a]"
              }`}
              style={{ fontSize: "12px" }}
            >
              {step.status === "done"  ? "check_circle" :
               step.status === "error" ? "error" :
               STEP_ICONS[step.id] ?? "circle"}
            </span>
            <span className={`text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-colors ${
              step.status === "done"   ? "text-[#6ee7b7]" :
              step.status === "active" ? "text-[#ff8f6f]" :
              step.status === "error"  ? "text-red-400"   :
              "text-[#2a2a2a]"
            }`}>
              {step.label}
            </span>
            {step.status === "done" && step.durationMs !== null && (
              <span className="text-[8px] font-mono text-[#494847]">{step.durationMs}ms</span>
            )}
            {step.status === "active" && (
              <motion.span
                className="w-1 h-1 rounded-full bg-[#ff8f6f]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
              />
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-6 h-px transition-colors ${
              step.status === "done" ? "bg-[#6ee7b7]/20" : "bg-white/[0.04]"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Raw HTTP bytes block ───────────────────────────────────────────
// Key headers are highlighted in orange.
// All other headers are near-invisible — they are noise for this lesson.

function RawHttpBlock({ raw }: { raw: string }) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n").slice(0, 20);

  return (
    <div className="font-mono text-[10px] leading-5 space-y-px">
      {lines.map((line, i) => {
        const isFirstLine    = i === 0;
        const colonIdx       = line.indexOf(":");
        const headerName     = colonIdx > -1 ? line.slice(0, colonIdx).trim() : "";
        const isKey          = KEY_HEADERS.includes(headerName);
        const isOtherHeader  = !isFirstLine && !isKey && colonIdx > -1 && line !== "";

        return (
          <div key={i} className="flex items-baseline gap-2 group">
            <span className={`transition-colors ${
              isFirstLine   ? "text-white font-semibold"    :
              isKey         ? "text-[#ff8f6f]"              :
              isOtherHeader ? "text-[#2a2a2a]"              :  // intentionally dim
              line === ""   ? "text-transparent"             :
              "text-[#3a3939]"
            }`}>
              {line || " "}
            </span>
            {isKey && (
              <span className="text-[8px] font-body text-[#494847] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {KEY_HEADER_TIPS[headerName] ?? ""}
              </span>
            )}
          </div>
        );
      })}
      {/* Legend */}
      <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-white/[0.04]">
        <span className="w-2 h-px bg-[#ff8f6f]/60" />
        <span className="text-[7px] font-body text-[#3a3939]">upgrade-critical headers (hover for explanation)</span>
        <span className="w-2 h-px bg-[#2a2a2a]" />
        <span className="text-[7px] font-body text-[#3a3939]">other headers (de-emphasized)</span>
      </div>
    </div>
  );
}

// ── Key derivation ─────────────────────────────────────────────────

function KeyDerivation({ d }: { d: HandshakeResponse["derivation"] }) {
  return (
    <div className="border border-[#ff8f6f]/10 bg-[#ff8f6f]/[0.02] rounded-[2px] px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[#ff8f6f]/50" style={{ fontSize: "12px" }}>functions</span>
        <span className="text-[9px] font-bold font-body uppercase tracking-[0.2em] text-[#494847]">
          Sec-WebSocket-Accept derivation
        </span>
      </div>

      <div className="space-y-1">
        <span className="text-[7px] font-body text-[#3a3939] uppercase tracking-[0.1em]">
          1 — concatenate client key + hardcoded RFC 6455 GUID
        </span>
        <div className="font-mono text-[9px] bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] px-3 py-2 break-all">
          <span className="text-[#ff8f6f]">{d.key}</span>
          <span className="text-[#494847]"> + </span>
          <span className="text-[#6ee7b7]/60">{d.guid}</span>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[7px] font-body text-[#3a3939] uppercase tracking-[0.1em]">2 — SHA-1 hash (hex)</span>
        <div className="font-mono text-[9px] bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] px-3 py-2 break-all text-[#6ee7b7]/50">
          {d.sha1Hex}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-[7px] font-body text-[#3a3939] uppercase tracking-[0.1em]">
          3 — base64-encode → <span className="font-mono text-[#494847]">Sec-WebSocket-Accept</span>
        </span>
        <div className="font-mono text-[9px] bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] px-3 py-2 text-[#6ee7b7]">
          {d.accept}
        </div>
      </div>

      <p className="text-[7px] font-body text-[#3a3939] leading-relaxed">
        The GUID <span className="font-mono text-[#494847]">258EAFA5…</span> is fixed in the RFC. The server
        must produce exactly this hash — the client verifies it to confirm a real WebSocket server responded,
        not an HTTP cache replaying a stale response.
      </p>
    </div>
  );
}

// ── Protocol Transition Stepper ────────────────────────────────────
// Shows the three protocol states as a horizontal stepper.

function ProtocolStepper({
  connState,
  statusCode,
}: {
  connState: ConnState;
  statusCode?: number;
}) {
  const isUpgrading = connState === "connecting";
  const isConnected = connState === "connected";
  const isFailed    = connState === "error" || (statusCode !== undefined && statusCode !== 101);

  const httpActive = isUpgrading || isConnected || isFailed;
  const wsActive   = isConnected;

  return (
    <div className="flex items-stretch gap-0">

      {/* Phase 1: HTTP */}
      <div className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-l-[2px] border-l border-t border-b transition-all duration-500 ${
        httpActive
          ? "border-[#ff8f6f]/20 bg-[#ff8f6f]/[0.03]"
          : "border-white/[0.04] bg-transparent"
      }`}>
        <span className={`material-symbols-outlined transition-colors ${
          httpActive ? "text-[#ff8f6f]/60" : "text-[#1e1e1e]"
        }`} style={{ fontSize: "16px" }}>http</span>
        <div className="text-center">
          <p className={`text-[8px] font-bold font-body uppercase tracking-[0.12em] transition-colors ${
            httpActive ? "text-[#ff8f6f]/80" : "text-[#1e1e1e]"
          }`}>HTTP/1.1</p>
          <p className={`text-[7px] font-body transition-colors ${
            httpActive ? "text-[#494847]" : "text-[#1e1e1e]"
          }`}>request · response</p>
        </div>
      </div>

      {/* Arrow + 101 label */}
      <div className={`flex flex-col items-center justify-center px-2 border-t border-b transition-colors ${
        isFailed
          ? "border-red-500/15 bg-red-500/[0.02]"
          : isConnected
            ? "border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.02]"
            : isUpgrading
              ? "border-white/[0.08] bg-[#111]"
              : "border-white/[0.04] bg-transparent"
      }`}>
        <span className={`material-symbols-outlined text-[10px] transition-colors ${
          isFailed    ? "text-red-400"     :
          isConnected ? "text-[#6ee7b7]"   :
          isUpgrading ? "text-[#ff8f6f]"   :
          "text-[#1e1e1e]"
        }`} style={{ fontSize: "13px" }}>
          {isFailed ? "close" : isConnected ? "check_circle" : "swap_horiz"}
        </span>
        <span className={`text-[7px] font-mono mt-0.5 transition-colors ${
          isFailed    ? "text-red-400/70"  :
          isConnected ? "text-[#6ee7b7]/70":
          isUpgrading ? "text-[#ff8f6f]/60":
          "text-[#1e1e1e]"
        }`}>
          {isFailed ? "failed" : isConnected ? "101" : "101?"}
        </span>
      </div>

      {/* Phase 3: WebSocket */}
      <div className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-r-[2px] border-r border-t border-b transition-all duration-500 ${
        isFailed
          ? "border-red-500/15 bg-red-500/[0.02]"
          : wsActive
            ? "border-[#6ee7b7]/25 bg-[#6ee7b7]/[0.04]"
            : "border-white/[0.04] bg-transparent"
      }`}>
        {isFailed ? (
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: "16px" }}>block</span>
        ) : (
          <span className={`material-symbols-outlined transition-colors ${
            wsActive ? "text-[#6ee7b7]" : "text-[#1e1e1e]"
          }`} style={{ fontSize: "16px" }}>wifi</span>
        )}
        <div className="text-center">
          {isFailed ? (
            <>
              <p className="text-[8px] font-bold font-body uppercase tracking-[0.12em] text-red-400">
                Upgrade Failed
              </p>
              <p className="text-[7px] font-body text-red-400/60">server rejected</p>
            </>
          ) : (
            <>
              <p className={`text-[8px] font-bold font-body uppercase tracking-[0.12em] transition-colors ${
                wsActive ? "text-[#6ee7b7]" : "text-[#1e1e1e]"
              }`}>WebSocket</p>
              <p className={`text-[7px] font-body transition-colors ${
                wsActive ? "text-[#6ee7b7]/60" : "text-[#1e1e1e]"
              }`}>persistent · full-duplex</p>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

// ── WebSocket pipe visual ──────────────────────────────────────────

function WebSocketPipe() {
  return (
    <div className="border border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.02] rounded-[2px] p-3">
      <p className="text-[7px] font-body text-[#494847] uppercase tracking-[0.2em] mb-3 text-center">
        Persistent WebSocket Connection
      </p>
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center gap-1">
          <div className="w-7 h-7 rounded-[2px] border border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.06] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#6ee7b7]/60" style={{ fontSize: "12px" }}>computer</span>
          </div>
          <span className="text-[7px] font-body text-[#3a3939]">Client</span>
        </div>

        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <div className="flex-1 border-t border-dashed border-[#6ee7b7]/25" />
            <span className="text-[7px] font-mono text-[#6ee7b7]/40 shrink-0">frame →</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[7px] font-mono text-[#6ee7b7]/40 shrink-0">← frame</span>
            <div className="flex-1 border-t border-dashed border-[#6ee7b7]/25" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="w-7 h-7 rounded-[2px] border border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.06] flex items-center justify-center">
            <span className="material-symbols-outlined text-[#6ee7b7]/60" style={{ fontSize: "12px" }}>dns</span>
          </div>
          <span className="text-[7px] font-body text-[#3a3939]">Server</span>
        </div>
      </div>
      <p className="text-[7px] font-body text-[#2a2a2a] mt-3 text-center">
        No HTTP — either side sends at any time
      </p>
    </div>
  );
}

// ── Conceptual sidebar ─────────────────────────────────────────────
// Left panel: answers "why" and "what changed".

function ConceptualSidebar({ connState }: { connState: ConnState }) {
  const isConnected = connState === "connected";
  const isActive    = connState === "connecting" || connState === "connected";
  const isFailed    = connState === "error";

  return (
    <div className="flex flex-col gap-3">

      {/* Live connection state */}
      <div className={`border rounded-[2px] px-3 py-3 transition-all duration-500 ${
        isFailed    ? "border-red-500/20 bg-red-500/[0.03]"    :
        isConnected ? "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.03]" :
        isActive    ? "border-[#ff8f6f]/15 bg-[#ff8f6f]/[0.02]" :
        "border-white/[0.05] bg-[#0c0c0c]"
      }`}>
        <div className="flex items-center gap-2 mb-1.5">
          {isConnected ? (
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-[#6ee7b7] shrink-0"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
          ) : (
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isFailed ? "bg-red-400" : isActive ? "bg-[#ff8f6f]" : "bg-[#2a2a2a]"
            }`} />
          )}
          <span className={`text-[9px] font-bold font-body ${
            isFailed    ? "text-red-400"    :
            isConnected ? "text-[#6ee7b7]"  :
            isActive    ? "text-[#ff8f6f]"  :
            "text-[#2a2a2a]"
          }`}>
            {isFailed    ? "Connection failed"   :
             isConnected ? "Connection OPEN"      :
             isActive    ? "Upgrading…"           :
             "Not connected"}
          </span>
        </div>
        <p className={`text-[8px] font-body leading-relaxed ${
          isFailed    ? "text-red-400/60"  :
          isConnected ? "text-[#494847]"   :
          isActive    ? "text-[#3a3939]"   :
          "text-[#2a2a2a]"
        }`}>
          {isFailed
            ? "Server did not send 101 Switching Protocols."
            : isConnected
              ? "WebSocket mode active. TCP socket is held open — no new HTTP requests needed."
              : isActive
                ? "Performing HTTP upgrade handshake…"
                : "Connect to see the protocol transition."}
        </p>
      </div>

      {/* What changed */}
      <div className="border border-white/[0.05] rounded-[2px] bg-[#0c0c0c] px-3 py-3 space-y-3">
        <p className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#494847]">
          What changed
        </p>

        {/* Before */}
        <div className="space-y-1.5">
          <p className="text-[7px] font-body uppercase tracking-[0.15em] text-[#ff8f6f]/50">
            Before — HTTP
          </p>
          <div className="space-y-1 pl-1">
            {[
              "Client sends request",
              "Server sends response",
              "Connection closes",
              "Repeat for every message",
            ].map((item) => (
              <div key={item} className="flex items-start gap-1.5">
                <span className="text-[#ff8f6f]/25 mt-px shrink-0 font-mono text-[8px]">›</span>
                <span className="text-[8px] font-body text-[#3a3939] leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-white/[0.04]" />

        {/* After */}
        <div className="space-y-1.5">
          <p className="text-[7px] font-body uppercase tracking-[0.15em] text-[#6ee7b7]/50">
            After — WebSocket
          </p>
          <div className="space-y-1 pl-1">
            {[
              "One TCP connection stays open",
              "Either side sends at any time",
              "No request/response cycle",
              "No HTTP overhead per message",
            ].map((item) => (
              <div key={item} className="flex items-start gap-1.5">
                <span className={`mt-px shrink-0 font-mono text-[8px] transition-colors ${
                  isConnected ? "text-[#6ee7b7]/40" : "text-[#2a2a2a]"
                }`}>›</span>
                <span className={`text-[8px] font-body leading-snug transition-colors ${
                  isConnected ? "text-[#494847]" : "text-[#2a2a2a]"
                }`}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why still HTTP at the start */}
      <div className="border border-white/[0.05] rounded-[2px] bg-[#0c0c0c] px-3 py-3 space-y-1.5">
        <p className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#494847]">
          Why start with HTTP?
        </p>
        <p className="text-[8px] font-body text-[#3a3939] leading-relaxed">
          WebSocket reuses HTTP/1.1 for the initial handshake so it works through
          existing proxies and firewalls. Once upgraded, HTTP is completely gone
          from that connection.
        </p>
      </div>

      {/* Pipe visual — appears after connected */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <WebSocketPipe />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ── Technical flow panel ───────────────────────────────────────────
// Right panel: the raw bytes, ordered as they happen on the wire.

function TechnicalFlow({
  request,
  response,
  connState,
}: {
  request:   HandshakeRequest | null;
  response:  HandshakeResponse | null;
  connState: ConnState;
}) {
  const isIdle      = connState === "idle";
  const isConnected = connState === "connected";
  const isFailed    = connState === "error";
  const succeeded   = response?.statusCode === 101;
  const rejected    = response !== null && response.statusCode !== 101;

  return (
    <div className="flex flex-col gap-3">

      {/* Protocol stepper — always visible */}
      <div className="border border-white/[0.06] rounded-[2px] bg-[#0c0c0c] p-3">
        <ProtocolStepper connState={connState} statusCode={response?.statusCode} />
      </div>

      {/* Idle placeholder */}
      {isIdle && (
        <div className="border border-white/[0.04] rounded-[2px] bg-[#0c0c0c] px-4 py-10 flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-[#1e1e1e]" style={{ fontSize: "32px" }}>swap_vert</span>
          <p className="text-[9px] font-body text-[#2a2a2a] text-center max-w-xs leading-relaxed">
            Click <span className="text-[#6ee7b7]">Connect</span> to run the upgrade handshake
            and see the raw HTTP bytes on the wire.
          </p>
        </div>
      )}

      {/* ── Client → Server: upgrade request ── */}
      <AnimatePresence>
        {request && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-[#ff8f6f]/15 rounded-[2px] bg-[#0c0c0c] overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-[#ff8f6f]/10 flex items-center gap-2 bg-[#ff8f6f]/[0.02]">
              <span className="material-symbols-outlined text-[#ff8f6f]/50" style={{ fontSize: "11px" }}>
                arrow_upward
              </span>
              <span className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#ff8f6f]/70">
                Client → Server
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[7px] font-mono text-[#3a3939]">HTTP/1.1 upgrade request</span>
              </div>
            </div>
            {/* Raw bytes */}
            <div className="px-4 py-3">
              <RawHttpBlock raw={request.raw} />
            </div>
            {/* Footnote */}
            <div className="px-3 py-1.5 border-t border-[#ff8f6f]/[0.06] bg-[#ff8f6f]/[0.01]">
              <p className="text-[7px] font-body text-[#2a2a2a]">
                This is still plain HTTP — the <span className="font-mono text-[#3a3939]">Upgrade</span> and{" "}
                <span className="font-mono text-[#3a3939]">Sec-WebSocket-Key</span> headers ask the server
                to switch. The connection stays TCP-open while awaiting the 101.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 101 divider ── */}
      <AnimatePresence>
        {request && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 px-1"
          >
            <div className="flex-1 h-px bg-white/[0.04]" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border text-[7px] font-bold font-body uppercase tracking-[0.12em] transition-all duration-300 ${
              rejected
                ? "border-red-500/20 text-red-400/70 bg-red-500/[0.04]"
                : succeeded
                  ? "border-[#6ee7b7]/20 text-[#6ee7b7]/70 bg-[#6ee7b7]/[0.04]"
                  : "border-white/[0.06] text-[#2a2a2a]"
            }`}>
              <span className="material-symbols-outlined" style={{ fontSize: "9px" }}>
                {rejected ? "close" : succeeded ? "check_circle" : "pending"}
              </span>
              {rejected
                ? `${response.statusCode} — upgrade rejected`
                : succeeded
                  ? "101 Switching Protocols"
                  : "awaiting 101…"}
            </div>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Server → Client: 101 response ── */}
      <AnimatePresence>
        {response && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`border rounded-[2px] bg-[#0c0c0c] overflow-hidden ${
              rejected ? "border-red-500/20" : "border-[#6ee7b7]/15"
            }`}
          >
            {/* Header */}
            <div className={`px-3 py-2 border-b flex items-center gap-2 ${
              rejected
                ? "border-red-500/10 bg-red-500/[0.02]"
                : "border-[#6ee7b7]/10 bg-[#6ee7b7]/[0.02]"
            }`}>
              <span className={`material-symbols-outlined`} style={{ fontSize: "11px" }}>
                {rejected ? "error" : "arrow_downward"}
              </span>
              <span className={`text-[8px] font-bold font-body uppercase tracking-[0.2em] ${
                rejected ? "text-red-400/70" : "text-[#6ee7b7]/70"
              }`}>
                Server → Client
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-[8px] font-mono font-bold ${
                  rejected ? "text-red-400/80" : "text-[#6ee7b7]/80"
                }`}>
                  {response.statusCode}
                </span>
                <span className="text-[7px] font-mono text-[#3a3939]">{response.elapsedMs}ms</span>
              </div>
            </div>

            {/* Raw bytes */}
            <div className="px-4 py-3">
              <RawHttpBlock raw={response.raw} />
            </div>

            {/* Footnote */}
            <div className={`px-3 py-1.5 border-t ${
              rejected
                ? "border-red-500/[0.06] bg-red-500/[0.01]"
                : "border-[#6ee7b7]/[0.06] bg-[#6ee7b7]/[0.01]"
            }`}>
              {rejected ? (
                <p className="text-[7px] font-body text-red-400/60">
                  Server did not send 101. This TCP connection remains HTTP — no WebSocket mode.
                  Common causes: wrong path, missing auth, server doesn{"'"}t support WebSocket.
                </p>
              ) : (
                <p className="text-[7px] font-body text-[#2a2a2a]">
                  The last HTTP message on this connection. Both sides now drop their HTTP parsers
                  and switch to the WebSocket frame protocol.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Key derivation ── */}
      <AnimatePresence>
        {response?.derivation && succeeded && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <KeyDerivation d={response.derivation} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Protocol switch notice ── */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-[2px] border border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.03]"
          >
            <span className="material-symbols-outlined text-[#6ee7b7]/60 shrink-0 mt-px" style={{ fontSize: "13px" }}>
              check_circle
            </span>
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold font-body text-[#6ee7b7]/80">
                HTTP is gone — WebSocket frame protocol is active
              </p>
              <p className="text-[8px] font-body text-[#3a3939] leading-relaxed">
                The HTTP parser on both ends has been discarded. This TCP connection now carries
                WebSocket frames. Either side can send frames without waiting for the other.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

const INITIAL_STEPS: LifecycleStep[] = [
  { id: "dns", label: "DNS", status: "pending", durationMs: null },
  { id: "tcp", label: "TCP", status: "pending", durationMs: null },
  { id: "tls", label: "TLS", status: "pending", durationMs: null },
];

export default function WebSocketPage() {
  const [appMode,   setAppMode]   = useState<AppMode>("virtual");
  const [url,       setUrl]       = useState("");
  const [connState, setConnState] = useState<ConnState>("idle");
  const [steps,     setSteps]     = useState<LifecycleStep[]>(INITIAL_STEPS);
  const [request,   setRequest]   = useState<HandshakeRequest  | null>(null);
  const [response,  setResponse]  = useState<HandshakeResponse | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const visibleSteps = steps.filter((s) => {
    if (s.id !== "tls") return true;
    if (appMode === "virtual") return false;
    try { return new URL(url).protocol === "wss:"; } catch { return false; }
  });

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setConnState("idle");
    setSteps(INITIAL_STEPS);
    setRequest(null);
    setResponse(null);
    setErrorMsg(null);
  }, []);

  const connect = useCallback(async () => {
    reset();
    abortRef.current = new AbortController();
    setConnState("connecting");

    try {
      const res = await fetch("/api/ws", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: appMode, url: appMode === "real" ? url : undefined }),
        signal:  abortRef.current.signal,
      });

      if (!res.body) return;
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(dataLine.slice(6)); } catch { continue; }

          if (ev.type === "lifecycle") {
            const { step, status, durationMs } = ev as {
              step: string; status: string; durationMs?: number;
            };
            setSteps((prev) =>
              prev.map((s) =>
                s.id === step
                  ? { ...s, status: status as StepStatus, durationMs: durationMs ?? null }
                  : s
              )
            );
          } else if (ev.type === "handshake_request") {
            setRequest(ev as unknown as HandshakeRequest);
          } else if (ev.type === "handshake_response") {
            setResponse(ev as unknown as HandshakeResponse);
          } else if (ev.type === "connected") {
            setConnState("connected");
          } else if (ev.type === "error") {
            setErrorMsg(ev.message as string);
            setConnState("error");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg((err as Error).message);
        setConnState("error");
      }
    }
  }, [appMode, url, reset]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const isConnecting = connState === "connecting";
  const isConnected  = connState === "connected";
  const isError      = connState === "error";

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] bg-[#0a0a0a]">
        <Link
          href="/simulate"
          className="flex items-center gap-1.5 text-[#494847] hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_back</span>
          <span className="text-[10px] font-body">Modules</span>
        </Link>

        <div className="w-px h-4 bg-white/[0.06]" />

        <span className="material-symbols-outlined text-[#6ee7b7]" style={{ fontSize: "16px" }}>swap_vert</span>

        <div>
          <span className="text-sm font-bold font-headline text-white">WebSocket</span>
          {/* Conceptual anchor — always visible */}
          <span className="ml-2 text-[8px] font-body text-[#3a3939]">
            HTTP + Upgrade + Persistent TCP connection
          </span>
        </div>

        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center rounded-[2px] border border-white/[0.06] overflow-hidden">
          {(["virtual", "real"] as AppMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setAppMode(m); reset(); setUrl(PRESETS[m]); }}
              className={`px-3 py-1 text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-all ${
                appMode === m
                  ? "bg-[#1a1919] text-white"
                  : "text-[#494847] hover:text-[#adaaaa]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* URL input (real mode only) */}
        {appMode === "real" && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://echo.example.com/ws"
            className="w-72 px-3 py-1.5 text-[10px] font-mono bg-[#111] border border-white/[0.06] rounded-[2px] text-[#adaaaa] placeholder:text-[#333] focus:outline-none focus:border-[#6ee7b7]/30 transition-colors"
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {(isConnected || isError) && (
            <button
              onClick={reset}
              className="text-[10px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>refresh</span>
              Reset
            </button>
          )}
          <button
            onClick={connect}
            disabled={isConnecting || (appMode === "real" && !url.trim())}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-[2px] font-bold font-body text-[10px] uppercase tracking-[0.15em] transition-all ${
              isConnecting
                ? "bg-[#1a1919] text-[#333] cursor-not-allowed"
                : isConnected
                  ? "bg-[#6ee7b7]/10 text-[#6ee7b7] border border-[#6ee7b7]/20 hover:bg-[#6ee7b7]/15"
                  : "bg-[#6ee7b7] text-[#003322] hover:bg-[#4dd6a4] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            }`}
          >
            {isConnecting ? (
              <>
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-[#6ee7b7]"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                />
                Connecting…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                  {isConnected ? "wifi" : "wifi_off"}
                </span>
                {isConnected ? "Run Again" : "Connect"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── TCP/TLS lifecycle bar ── */}
      <div className="shrink-0 px-4 py-2 border-b border-white/[0.04] flex items-center gap-4 bg-[#090909]">
        <span className="text-[7px] font-body text-[#2a2a2a] uppercase tracking-[0.2em] shrink-0">
          Transport
        </span>
        <LifecycleSteps steps={visibleSteps} />

        {(isConnecting || isConnected) && (
          <div className={`ml-auto flex items-center gap-1.5 px-2 py-1 rounded-[2px] border ${
            isConnected
              ? "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.04]"
              : "border-[#ff8f6f]/20 bg-[#ff8f6f]/[0.04]"
          }`}>
            <span
              className={`material-symbols-outlined ${isConnected ? "text-[#6ee7b7]" : "text-[#ff8f6f]"}`}
              style={{ fontSize: "10px" }}
            >
              {isConnected ? "check_circle" : "pending"}
            </span>
            <span className={`text-[7px] font-bold font-body uppercase tracking-[0.15em] ${
              isConnected ? "text-[#6ee7b7]" : "text-[#ff8f6f]"
            }`}>
              {isConnected ? "Handshake complete" : "Handshaking…"}
            </span>
          </div>
        )}

        {isError && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-red-500/20 bg-red-500/[0.04]">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: "10px" }}>error</span>
            <span className="text-[7px] font-bold font-body uppercase tracking-[0.15em] text-red-400">
              Connection failed
            </span>
          </div>
        )}
      </div>

      {/* ── Main two-column layout ── */}
      <div className="flex-1 min-h-0 flex gap-4 p-4">

        {/* Left: conceptual sidebar */}
        <div className="w-56 shrink-0 overflow-y-auto">
          <ConceptualSidebar connState={connState} />
        </div>

        {/* Right: technical flow */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0">
          <TechnicalFlow
            request={request}
            response={response}
            connState={connState}
          />

          {/* Network-level error (DNS/TCP/TLS failures) */}
          {isError && errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 px-3 py-2 rounded-[2px] border border-red-500/20 bg-red-500/[0.04] flex items-start gap-2"
            >
              <span className="material-symbols-outlined text-red-400 shrink-0 mt-px" style={{ fontSize: "12px" }}>
                error
              </span>
              <div>
                <p className="text-[8px] font-bold font-body text-red-400 mb-0.5">
                  {errorMsg.startsWith("DNS") ? "DNS resolution failed" :
                   errorMsg.startsWith("TCP") ? "TCP connection failed" :
                   errorMsg.startsWith("TLS") ? "TLS handshake failed" :
                   "Handshake failed"}
                </p>
                <p className="text-[8px] font-mono text-red-400/70">{errorMsg}</p>
              </div>
            </motion.div>
          )}
        </div>

      </div>
    </div>
  );
}
