"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { WsMessage, FrameDetail } from "@/lib/ws-sessions";

// ── Types ─────────────────────────────────────────────────────────

type AppMode    = "virtual" | "real";
type ConnState  = "idle" | "connecting" | "connected" | "disconnected" | "error";
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
  virtual: "",
  real:    "wss://ws.postman-echo.com/raw",
};

const STEP_ICONS: Record<string, string> = {
  dns: "language",
  tcp: "cable",
  tls: "lock",
};

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

function RawHttpBlock({ raw }: { raw: string }) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n").slice(0, 20);
  return (
    <div className="font-mono text-[10px] leading-5 space-y-px">
      {lines.map((line, i) => {
        const isFirstLine   = i === 0;
        const colonIdx      = line.indexOf(":");
        const headerName    = colonIdx > -1 ? line.slice(0, colonIdx).trim() : "";
        const isKey         = KEY_HEADERS.includes(headerName);
        const isOtherHeader = !isFirstLine && !isKey && colonIdx > -1 && line !== "";
        return (
          <div key={i} className="flex items-baseline gap-2 group">
            <span className={`transition-colors ${
              isFirstLine   ? "text-white font-semibold" :
              isKey         ? "text-[#ff8f6f]"           :
              isOtherHeader ? "text-[#2a2a2a]"           :
              line === ""   ? "text-transparent"          :
              "text-[#3a3939]"
            }`}>{line || " "}</span>
            {isKey && (
              <span className="text-[8px] font-body text-[#494847] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {KEY_HEADER_TIPS[headerName] ?? ""}
              </span>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-white/[0.04]">
        <span className="w-2 h-px bg-[#ff8f6f]/60" />
        <span className="text-[7px] font-body text-[#3a3939]">upgrade-critical (hover for tip)</span>
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
        <span className="text-[7px] font-body text-[#3a3939] uppercase tracking-[0.1em]">1 — key + GUID</span>
        <div className="font-mono text-[9px] bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] px-3 py-2 break-all">
          <span className="text-[#ff8f6f]">{d.key}</span>
          <span className="text-[#494847]"> + </span>
          <span className="text-[#6ee7b7]/60">{d.guid}</span>
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-[7px] font-body text-[#3a3939] uppercase tracking-[0.1em]">2 — SHA-1 (hex)</span>
        <div className="font-mono text-[9px] bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] px-3 py-2 break-all text-[#6ee7b7]/50">
          {d.sha1Hex}
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-[7px] font-body text-[#3a3939] uppercase tracking-[0.1em]">3 — base64 → Sec-WebSocket-Accept</span>
        <div className="font-mono text-[9px] bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] px-3 py-2 text-[#6ee7b7]">
          {d.accept}
        </div>
      </div>
      <p className="text-[7px] font-body text-[#3a3939] leading-relaxed">
        The GUID is fixed in RFC 6455 — prevents HTTP caches from replaying a WebSocket response.
      </p>
    </div>
  );
}

// ── Protocol stepper ───────────────────────────────────────────────

function ProtocolStepper({ connState, statusCode }: { connState: ConnState; statusCode?: number }) {
  const isUpgrading  = connState === "connecting";
  const isConnected  = connState === "connected" || connState === "disconnected";
  const isFailed     = connState === "error" || (statusCode !== undefined && statusCode !== 101);
  const httpActive   = isUpgrading || isConnected || isFailed;

  return (
    <div className="flex items-stretch gap-0">
      <div className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-l-[2px] border-l border-t border-b transition-all duration-500 ${
        httpActive ? "border-[#ff8f6f]/20 bg-[#ff8f6f]/[0.03]" : "border-white/[0.04] bg-transparent"
      }`}>
        <span className={`material-symbols-outlined transition-colors ${httpActive ? "text-[#ff8f6f]/60" : "text-[#1e1e1e]"}`} style={{ fontSize: "16px" }}>http</span>
        <div className="text-center">
          <p className={`text-[8px] font-bold font-body uppercase tracking-[0.12em] ${httpActive ? "text-[#ff8f6f]/80" : "text-[#1e1e1e]"}`}>HTTP/1.1</p>
          <p className={`text-[7px] font-body ${httpActive ? "text-[#494847]" : "text-[#1e1e1e]"}`}>request · response</p>
        </div>
      </div>
      <div className={`flex flex-col items-center justify-center px-2 border-t border-b transition-colors ${
        isFailed ? "border-red-500/15 bg-red-500/[0.02]" :
        isConnected ? "border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.02]" :
        isUpgrading ? "border-white/[0.08] bg-[#111]" :
        "border-white/[0.04] bg-transparent"
      }`}>
        <span className={`material-symbols-outlined transition-colors ${
          isFailed ? "text-red-400" : isConnected ? "text-[#6ee7b7]" : isUpgrading ? "text-[#ff8f6f]" : "text-[#1e1e1e]"
        }`} style={{ fontSize: "13px" }}>
          {isFailed ? "close" : isConnected ? "check_circle" : "swap_horiz"}
        </span>
        <span className={`text-[7px] font-mono mt-0.5 transition-colors ${
          isFailed ? "text-red-400/70" : isConnected ? "text-[#6ee7b7]/70" : isUpgrading ? "text-[#ff8f6f]/60" : "text-[#1e1e1e]"
        }`}>{isFailed ? "failed" : isConnected ? "101" : "101?"}</span>
      </div>
      <div className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-r-[2px] border-r border-t border-b transition-all duration-500 ${
        isFailed ? "border-red-500/15 bg-red-500/[0.02]" :
        isConnected ? "border-[#6ee7b7]/25 bg-[#6ee7b7]/[0.04]" :
        "border-white/[0.04] bg-transparent"
      }`}>
        {isFailed
          ? <span className="material-symbols-outlined text-red-400" style={{ fontSize: "16px" }}>block</span>
          : <span className={`material-symbols-outlined transition-colors ${isConnected ? "text-[#6ee7b7]" : "text-[#1e1e1e]"}`} style={{ fontSize: "16px" }}>wifi</span>
        }
        <div className="text-center">
          {isFailed ? (
            <><p className="text-[8px] font-bold font-body uppercase tracking-[0.12em] text-red-400">Upgrade Failed</p>
            <p className="text-[7px] font-body text-red-400/60">server rejected</p></>
          ) : (
            <><p className={`text-[8px] font-bold font-body uppercase tracking-[0.12em] ${isConnected ? "text-[#6ee7b7]" : "text-[#1e1e1e]"}`}>WebSocket</p>
            <p className={`text-[7px] font-body ${isConnected ? "text-[#6ee7b7]/60" : "text-[#1e1e1e]"}`}>
              {connState === "disconnected" ? "closed gracefully" : "persistent · full-duplex"}
            </p></>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Frame detail badge ─────────────────────────────────────────────

function FrameBadge({ frame, direction }: { frame: FrameDetail; direction: "sent" | "received" }) {
  const [open, setOpen] = useState(false);
  const color = direction === "sent" ? "text-[#ff8f6f]" : "text-[#6ee7b7]";
  const borderColor = direction === "sent" ? "border-[#ff8f6f]/15" : "border-[#6ee7b7]/15";
  const bgColor = direction === "sent" ? "bg-[#ff8f6f]/[0.03]" : "bg-[#6ee7b7]/[0.03]";

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border ${borderColor} ${bgColor} hover:opacity-80 transition-opacity`}
      >
        <span className={`text-[7px] font-mono ${color}`}>
          {frame.opcodeLabel}
        </span>
        <span className={`text-[7px] font-mono text-[#3a3939]`}>{frame.payloadLen}B</span>
        <span className={`material-symbols-outlined text-[#3a3939] transition-transform ${open ? "rotate-180" : ""}`} style={{ fontSize: "9px" }}>
          expand_more
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={`mt-1.5 border ${borderColor} ${bgColor} rounded-[2px] px-3 py-2 space-y-1.5`}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  ["opcode",   `0x${frame.opcode.toString(16).padStart(2,"0")} (${frame.opcodeLabel})`],
                  ["FIN",      frame.fin    ? "set — final fragment" : "not set — more fragments follow"],
                  ["masked",   frame.masked ? "yes — XOR with masking key (client → server)" : "no (server → client)"],
                  ["length",   `${frame.payloadLen} bytes`],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-px">
                    <span className="text-[6px] font-body uppercase tracking-[0.12em] text-[#3a3939]">{k}</span>
                    <span className="text-[8px] font-mono text-[#494847]">{v}</span>
                  </div>
                ))}
              </div>
              {frame.maskingKey && (
                <div className="pt-1 border-t border-white/[0.04]">
                  <span className="text-[6px] font-body uppercase tracking-[0.12em] text-[#3a3939] block mb-0.5">
                    masking key
                  </span>
                  <span className="text-[8px] font-mono text-[#ff8f6f]/70">{frame.maskingKey}</span>
                </div>
              )}
              <div className="pt-1 border-t border-white/[0.04]">
                <span className="text-[6px] font-body uppercase tracking-[0.12em] text-[#3a3939] block mb-0.5">
                  raw frame (hex)
                </span>
                <span className="text-[8px] font-mono text-[#3a3939] break-all leading-relaxed">
                  {frame.rawHex}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── JSON display (for server-sent structured data) ─────────────────

function tryParseJson(text: string): Record<string, unknown> | null {
  if (text[0] !== "{" && text[0] !== "[") return null;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return null; }
}

function JsonView({ obj }: { obj: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(obj);
  const preview = entries.slice(0, 5);

  return (
    <div className="space-y-1.5">
      {/* Compact key-value preview */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {preview.map(([k, v]) => (
          <span key={k} className="text-[9px] font-mono">
            <span className="text-[#6ee7b7]/40">{k}</span>
            <span className="text-[#3a3939]">: </span>
            <span className="text-[#6ee7b7]/80 max-w-[120px] truncate inline-block align-bottom">
              {typeof v === "string" ? `"${v.slice(0, 24)}${v.length > 24 ? "…" : ""}"` : String(v)}
            </span>
          </span>
        ))}
        {entries.length > 5 && (
          <span className="text-[8px] font-mono text-[#2a2a2a]">+{entries.length - 5} keys</span>
        )}
      </div>
      {/* Full JSON */}
      {expanded && (
        <pre className="text-[8px] font-mono text-[#6ee7b7]/50 whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-[#0a0a0a] border border-white/[0.04] rounded-[2px] p-2">
          {JSON.stringify(obj, null, 2)}
        </pre>
      )}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[7px] font-body text-[#3a3939] hover:text-[#494847] transition-colors"
      >
        {expanded ? "collapse" : "expand JSON"}
      </button>
    </div>
  );
}

// ── Single message row ─────────────────────────────────────────────

function MessageRow({ msg }: { msg: WsMessage }) {
  const sent   = msg.direction === "sent";
  const isPing = msg.frame.opcode === 0x09;
  const isPong = msg.frame.opcode === 0x0a;
  const isControl = isPing || isPong;
  const parsed = !sent && !isControl ? tryParseJson(msg.text) : null;

  // Ping/pong render as a compact inline control-frame row, not a chat bubble
  if (isControl) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 py-0.5"
      >
        <div className="flex-1 h-px bg-white/[0.04]" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border border-[#8b8bff]/15 bg-[#8b8bff]/[0.04]">
          <span className="material-symbols-outlined text-[#8b8bff]/60" style={{ fontSize: "10px" }}>
            {isPing ? "arrow_downward" : "arrow_upward"}
          </span>
          <span className="text-[8px] font-bold font-mono text-[#8b8bff]/80 uppercase">
            {isPing ? "PING" : "PONG"}
          </span>
          {msg.text && (
            <span className="text-[7px] font-mono text-[#494847]">"{msg.text}"</span>
          )}
          <FrameBadge frame={msg.frame} direction={msg.direction} />
        </div>
        {isPing && (
          <span className="text-[7px] font-body text-[#3a3939] shrink-0">
            keepalive — auto-ponged
          </span>
        )}
        {isPong && (
          <span className="text-[7px] font-body text-[#3a3939] shrink-0">
            RFC 6455 §5.5.3
          </span>
        )}
        <div className="flex-1 h-px bg-white/[0.04]" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-1 ${sent ? "items-end" : "items-start"}`}
    >
      {/* Bubble */}
      <div className={`max-w-[85%] px-3 py-2 rounded-[2px] border ${
        sent
          ? "border-[#ff8f6f]/20 bg-[#ff8f6f]/[0.06]"
          : "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.06]"
      }`}>
        {parsed ? (
          <JsonView obj={parsed} />
        ) : (
          <p className={`text-[10px] font-mono break-words ${sent ? "text-[#ff8f6f]/90" : "text-[#6ee7b7]/90"}`}>
            {msg.text.length > 300 ? msg.text.slice(0, 300) + "…" : msg.text}
          </p>
        )}
      </div>

      {/* Meta row */}
      <div className={`flex items-center gap-2 ${sent ? "flex-row-reverse" : "flex-row"}`}>
        <span className={`text-[7px] font-bold font-body uppercase tracking-[0.15em] ${sent ? "text-[#ff8f6f]/40" : "text-[#6ee7b7]/40"}`}>
          {sent ? "↑ sent" : "↓ received"}
        </span>
        <span className="text-[7px] font-mono text-[#2a2a2a]">
          {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <FrameBadge frame={msg.frame} direction={msg.direction} />
      </div>
    </motion.div>
  );
}

// ── WebSocket pipe visual ──────────────────────────────────────────

function WebSocketPipe({ connState }: { connState: ConnState }) {
  const isDisconnected = connState === "disconnected";
  return (
    <div className={`border rounded-[2px] p-3 transition-all ${
      isDisconnected ? "border-[#2a2a2a] bg-transparent" : "border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.02]"
    }`}>
      <p className="text-[7px] font-body text-[#494847] uppercase tracking-[0.2em] mb-3 text-center">
        {isDisconnected ? "Connection Closed" : "Persistent WebSocket Connection"}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center gap-1">
          <div className={`w-7 h-7 rounded-[2px] border flex items-center justify-center transition-all ${
            isDisconnected ? "border-[#2a2a2a] bg-transparent" : "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.06]"
          }`}>
            <span className={`material-symbols-outlined transition-colors ${isDisconnected ? "text-[#2a2a2a]" : "text-[#6ee7b7]/60"}`} style={{ fontSize: "12px" }}>computer</span>
          </div>
          <span className="text-[7px] font-body text-[#3a3939]">Client</span>
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <div className={`flex-1 border-t transition-colors ${isDisconnected ? "border-[#2a2a2a]" : "border-dashed border-[#6ee7b7]/25"}`} />
            <span className={`text-[7px] font-mono shrink-0 transition-colors ${isDisconnected ? "text-[#2a2a2a]" : "text-[#6ee7b7]/40"}`}>→</span>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-[7px] font-mono shrink-0 transition-colors ${isDisconnected ? "text-[#2a2a2a]" : "text-[#6ee7b7]/40"}`}>←</span>
            <div className={`flex-1 border-t transition-colors ${isDisconnected ? "border-[#2a2a2a]" : "border-dashed border-[#6ee7b7]/25"}`} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className={`w-7 h-7 rounded-[2px] border flex items-center justify-center transition-all ${
            isDisconnected ? "border-[#2a2a2a] bg-transparent" : "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.06]"
          }`}>
            <span className={`material-symbols-outlined transition-colors ${isDisconnected ? "text-[#2a2a2a]" : "text-[#6ee7b7]/60"}`} style={{ fontSize: "12px" }}>dns</span>
          </div>
          <span className="text-[7px] font-body text-[#3a3939]">Server</span>
        </div>
      </div>
    </div>
  );
}

// ── Conceptual sidebar ─────────────────────────────────────────────

function ConceptualSidebar({ connState, messageCount }: { connState: ConnState; messageCount: number }) {
  const isConnected    = connState === "connected";
  const isActive       = connState === "connecting" || connState === "connected";
  const isFailed       = connState === "error";
  const isDisconnected = connState === "disconnected";

  return (
    <div className="flex flex-col gap-3">
      {/* Connection state */}
      <div className={`border rounded-[2px] px-3 py-3 transition-all duration-500 ${
        isFailed       ? "border-red-500/20 bg-red-500/[0.03]"      :
        isDisconnected ? "border-white/[0.04] bg-[#0c0c0c]"         :
        isConnected    ? "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.03]"  :
        isActive       ? "border-[#ff8f6f]/15 bg-[#ff8f6f]/[0.02]"  :
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
              isFailed    ? "bg-red-400"   :
              isActive    ? "bg-[#ff8f6f]" :
              isDisconnected ? "bg-[#2a2a2a]" :
              "bg-[#2a2a2a]"
            }`} />
          )}
          <span className={`text-[9px] font-bold font-body ${
            isFailed    ? "text-red-400"    :
            isConnected ? "text-[#6ee7b7]"  :
            isActive    ? "text-[#ff8f6f]"  :
            isDisconnected ? "text-[#494847]" :
            "text-[#2a2a2a]"
          }`}>
            {isFailed      ? "Connection failed"    :
             isConnected   ? "Connection OPEN"       :
             isActive      ? "Upgrading…"            :
             isDisconnected? "Disconnected"           :
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
              ? `WebSocket active. ${messageCount > 0 ? `${messageCount} message${messageCount !== 1 ? "s" : ""} exchanged.` : "Type a message below."}`
              : isActive
                ? "Performing HTTP upgrade handshake…"
                : isDisconnected
                  ? "Close frame sent. TCP connection torn down."
                  : "Connect to see the protocol transition."}
        </p>
      </div>

      {/* What changed */}
      <div className="border border-white/[0.05] rounded-[2px] bg-[#0c0c0c] px-3 py-3 space-y-3">
        <p className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#494847]">What changed</p>
        <div className="space-y-1.5">
          <p className="text-[7px] font-body uppercase tracking-[0.15em] text-[#ff8f6f]/50">Before — HTTP</p>
          <div className="space-y-1 pl-1">
            {["Client sends request", "Server sends response", "Connection closes", "Repeat for every message"].map((item) => (
              <div key={item} className="flex items-start gap-1.5">
                <span className="text-[#ff8f6f]/25 mt-px shrink-0 font-mono text-[8px]">›</span>
                <span className="text-[8px] font-body text-[#3a3939] leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="h-px bg-white/[0.04]" />
        <div className="space-y-1.5">
          <p className="text-[7px] font-body uppercase tracking-[0.15em] text-[#6ee7b7]/50">After — WebSocket</p>
          <div className="space-y-1 pl-1">
            {["One TCP connection stays open", "Either side sends at any time", "No request/response cycle", "No HTTP overhead per message"].map((item) => (
              <div key={item} className="flex items-start gap-1.5">
                <span className={`mt-px shrink-0 font-mono text-[8px] transition-colors ${isConnected ? "text-[#6ee7b7]/40" : "text-[#2a2a2a]"}`}>›</span>
                <span className={`text-[8px] font-body leading-snug transition-colors ${isConnected ? "text-[#494847]" : "text-[#2a2a2a]"}`}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why start with HTTP */}
      <div className="border border-white/[0.05] rounded-[2px] bg-[#0c0c0c] px-3 py-3 space-y-1.5">
        <p className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#494847]">Why start with HTTP?</p>
        <p className="text-[8px] font-body text-[#3a3939] leading-relaxed">
          WebSocket reuses HTTP/1.1 for the initial handshake so it works through existing proxies and firewalls. Once upgraded, HTTP is gone from that connection.
        </p>
      </div>

      {/* Pipe visual */}
      <AnimatePresence>
        {(isConnected || isDisconnected) && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <WebSocketPipe connState={connState} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Frame format explainer */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="border border-white/[0.05] rounded-[2px] bg-[#0c0c0c] px-3 py-3 space-y-1.5"
          >
            <p className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#494847]">Frame format</p>
            <p className="text-[8px] font-body text-[#3a3939] leading-relaxed">
              Client frames are always <span className="text-[#ff8f6f]/70">masked</span> (XOR with a random 4-byte key). Server frames are not masked. Tap the opcode badge on any message to see the raw frame bytes.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Technical flow panel ───────────────────────────────────────────

function TechnicalFlow({
  request, response, connState,
}: {
  request:   HandshakeRequest | null;
  response:  HandshakeResponse | null;
  connState: ConnState;
}) {
  const isIdle      = connState === "idle";
  const succeeded   = response?.statusCode === 101;
  const rejected    = response !== null && (response?.statusCode ?? 0) !== 101;
  const isConnected = connState === "connected" || connState === "disconnected";

  return (
    <div className="flex flex-col gap-3">
      <div className="border border-white/[0.06] rounded-[2px] bg-[#0c0c0c] p-3">
        <ProtocolStepper connState={connState} statusCode={response?.statusCode} />
      </div>

      {isIdle && (
        <div className="border border-white/[0.04] rounded-[2px] bg-[#0c0c0c] px-4 py-10 flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-[#1e1e1e]" style={{ fontSize: "32px" }}>swap_vert</span>
          <p className="text-[9px] font-body text-[#2a2a2a] text-center max-w-xs leading-relaxed">
            Click <span className="text-[#6ee7b7]">Connect</span> to run the upgrade handshake and see the raw bytes.
          </p>
        </div>
      )}

      {/* Request */}
      <AnimatePresence>
        {request && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="border border-[#ff8f6f]/15 rounded-[2px] bg-[#0c0c0c] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[#ff8f6f]/10 flex items-center gap-2 bg-[#ff8f6f]/[0.02]">
              <span className="material-symbols-outlined text-[#ff8f6f]/50" style={{ fontSize: "11px" }}>arrow_upward</span>
              <span className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#ff8f6f]/70">Client → Server</span>
              <span className="ml-auto text-[7px] font-mono text-[#3a3939]">HTTP/1.1 upgrade request</span>
            </div>
            <div className="px-4 py-3"><RawHttpBlock raw={request.raw} /></div>
            <div className="px-3 py-1.5 border-t border-[#ff8f6f]/[0.06] bg-[#ff8f6f]/[0.01]">
              <p className="text-[7px] font-body text-[#2a2a2a]">
                Still HTTP — the <span className="font-mono text-[#3a3939]">Upgrade</span> header asks the server to switch. Connection stays open awaiting 101.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 101 divider */}
      <AnimatePresence>
        {request && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 px-1">
            <div className="flex-1 h-px bg-white/[0.04]" />
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] border text-[7px] font-bold font-body uppercase tracking-[0.12em] transition-all duration-300 ${
              rejected    ? "border-red-500/20 text-red-400/70 bg-red-500/[0.04]" :
              succeeded   ? "border-[#6ee7b7]/20 text-[#6ee7b7]/70 bg-[#6ee7b7]/[0.04]" :
              "border-white/[0.06] text-[#2a2a2a]"
            }`}>
              <span className="material-symbols-outlined" style={{ fontSize: "9px" }}>
                {rejected ? "close" : succeeded ? "check_circle" : "pending"}
              </span>
              {rejected ? `${response!.statusCode} — upgrade rejected` : succeeded ? "101 Switching Protocols" : "awaiting 101…"}
            </div>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Response */}
      <AnimatePresence>
        {response && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className={`border rounded-[2px] bg-[#0c0c0c] overflow-hidden ${rejected ? "border-red-500/20" : "border-[#6ee7b7]/15"}`}
          >
            <div className={`px-3 py-2 border-b flex items-center gap-2 ${rejected ? "border-red-500/10 bg-red-500/[0.02]" : "border-[#6ee7b7]/10 bg-[#6ee7b7]/[0.02]"}`}>
              <span className="material-symbols-outlined" style={{ fontSize: "11px" }}>{rejected ? "error" : "arrow_downward"}</span>
              <span className={`text-[8px] font-bold font-body uppercase tracking-[0.2em] ${rejected ? "text-red-400/70" : "text-[#6ee7b7]/70"}`}>Server → Client</span>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-[8px] font-mono font-bold ${rejected ? "text-red-400/80" : "text-[#6ee7b7]/80"}`}>{response.statusCode}</span>
                <span className="text-[7px] font-mono text-[#3a3939]">{response.elapsedMs}ms</span>
              </div>
            </div>
            <div className="px-4 py-3"><RawHttpBlock raw={response.raw} /></div>
            <div className={`px-3 py-1.5 border-t ${rejected ? "border-red-500/[0.06] bg-red-500/[0.01]" : "border-[#6ee7b7]/[0.06] bg-[#6ee7b7]/[0.01]"}`}>
              {rejected ? (
                <p className="text-[7px] font-body text-red-400/60">
                  Server did not send 101. No WebSocket mode. Common causes: wrong path, missing auth, server doesn&apos;t support WS.
                </p>
              ) : (
                <p className="text-[7px] font-body text-[#2a2a2a]">
                  Last HTTP message on this connection. Both sides drop their HTTP parsers and switch to WebSocket frames.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Key derivation */}
      <AnimatePresence>
        {response?.derivation && succeeded && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <KeyDerivation d={response.derivation} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Protocol switch notice */}
      <AnimatePresence>
        {isConnected && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-[2px] border border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.03]"
          >
            <span className="material-symbols-outlined text-[#6ee7b7]/60 shrink-0 mt-px" style={{ fontSize: "13px" }}>check_circle</span>
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold font-body text-[#6ee7b7]/80">HTTP is gone — WebSocket frame protocol is active</p>
              <p className="text-[8px] font-body text-[#3a3939] leading-relaxed">
                Both ends discarded their HTTP parsers. This TCP connection now carries WebSocket frames. Either side can send without waiting.
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
  const [appMode,    setAppMode]    = useState<AppMode>("virtual");
  const [url,        setUrl]        = useState("");
  const [connState,  setConnState]  = useState<ConnState>("idle");
  const [steps,      setSteps]      = useState<LifecycleStep[]>(INITIAL_STEPS);
  const [request,    setRequest]    = useState<HandshakeRequest  | null>(null);
  const [response,   setResponse]   = useState<HandshakeResponse | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [sessionId,     setSessionId]     = useState<string | null>(null);
  const [messages,      setMessages]      = useState<WsMessage[]>([]);
  const [input,         setInput]         = useState("");
  const [sending,       setSending]       = useState(false);
  const [paused,        setPaused]        = useState(false);
  const [totalReceived, setTotalReceived] = useState(0);
  const [msgRate,       setMsgRate]       = useState(0);
  const [showDetails,   setShowDetails]   = useState(true);

  const handshakeAbortRef  = useRef<AbortController | null>(null);
  const streamAbortRef     = useRef<AbortController | null>(null);
  const msgLogRef          = useRef<HTMLDivElement | null>(null);
  const pausedRef          = useRef(false);
  const recentTimestamps   = useRef<number[]>([]);

  // Auto-scroll message log (only when not paused)
  useEffect(() => {
    if (!paused && msgLogRef.current) {
      msgLogRef.current.scrollTop = msgLogRef.current.scrollHeight;
    }
  }, [messages, paused]);

  // Collapse protocol details when first message arrives so messages are visible
  useEffect(() => {
    if (messages.length === 1) setShowDetails(false);
  }, [messages.length]);

  // Rolling message rate — recalculate every 500ms
  useEffect(() => {
    if (connState !== "connected") { setMsgRate(0); return; }
    const id = setInterval(() => {
      const now = Date.now();
      recentTimestamps.current = recentTimestamps.current.filter((t) => now - t < 1000);
      setMsgRate(recentTimestamps.current.length);
    }, 500);
    return () => clearInterval(id);
  }, [connState]);

  const visibleSteps = steps.filter((s) => {
    if (s.id !== "tls") return true;
    if (appMode === "virtual") return false;
    try { return new URL(url).protocol === "wss:"; } catch { return false; }
  });

  // Open SSE stream for incoming WS frames
  const openMessageStream = useCallback((sid: string) => {
    const ac = new AbortController();
    streamAbortRef.current = ac;

    (async () => {
      try {
        const res = await fetch(`/api/ws/stream?sessionId=${sid}`, { signal: ac.signal });
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

            if (ev.type === "message") {
              const msg = ev as unknown as WsMessage;
              recentTimestamps.current.push(Date.now());
              setTotalReceived((n) => n + 1);
              if (!pausedRef.current) {
                // Cap at 200 — drop the oldest to prevent memory growth on fast streams
                setMessages((prev) => {
                  const next = [...prev, msg];
                  return next.length > 200 ? next.slice(-200) : next;
                });
              }
            } else if (ev.type === "closed") {
              setConnState("disconnected");
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setConnState("disconnected");
        }
      }
    })();
  }, []);

  const reset = useCallback(async (sid?: string | null) => {
    handshakeAbortRef.current?.abort();
    streamAbortRef.current?.abort();

    const idToClose = sid ?? sessionId;
    if (idToClose) {
      // Fire-and-forget disconnect
      fetch("/api/ws/disconnect", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId: idToClose }),
      }).catch(() => {});
    }

    setConnState("idle");
    setSteps(INITIAL_STEPS);
    setRequest(null);
    setResponse(null);
    setErrorMsg(null);
    setSessionId(null);
    setMessages([]);
    setInput("");
    setPaused(false);
    setTotalReceived(0);
    setMsgRate(0);
    setShowDetails(true);
    pausedRef.current = false;
    recentTimestamps.current = [];
  }, [sessionId]);

  const connect = useCallback(async () => {
    await reset(null); // reset without closing old session (there might not be one)
    handshakeAbortRef.current = new AbortController();
    setConnState("connecting");

    try {
      const res = await fetch("/api/ws", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: appMode, url: appMode === "real" ? url : undefined }),
        signal:  handshakeAbortRef.current.signal,
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
            const { step, status, durationMs } = ev as { step: string; status: string; durationMs?: number };
            setSteps((prev) => prev.map((s) =>
              s.id === step ? { ...s, status: status as StepStatus, durationMs: durationMs ?? null } : s
            ));
          } else if (ev.type === "handshake_request") {
            setRequest(ev as unknown as HandshakeRequest);
          } else if (ev.type === "handshake_response") {
            setResponse(ev as unknown as HandshakeResponse);
          } else if (ev.type === "connected") {
            const sid = ev.sessionId as string;
            setConnState("connected");
            setSessionId(sid);
            openMessageStream(sid);
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
  }, [appMode, url, reset, openMessageStream]);

  const sendMessage = useCallback(async () => {
    if (!sessionId || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      const res  = await fetch("/api/ws/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId, text }),
      });
      const data = await res.json();
      if (data.message) setMessages((prev) => [...prev, data.message as WsMessage]);
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  }, [sessionId, input, sending]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  }, []);

  const disconnect = useCallback(async () => {
    streamAbortRef.current?.abort();
    if (sessionId) {
      try {
        await fetch("/api/ws/disconnect", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ sessionId }),
        });
      } catch { /* ignore */ }
    }
    setConnState("disconnected");
    setSessionId(null);
  }, [sessionId]);

  useEffect(() => () => {
    handshakeAbortRef.current?.abort();
    streamAbortRef.current?.abort();
  }, []);

  const isIdle         = connState === "idle";
  const isConnecting   = connState === "connecting";
  const isConnected    = connState === "connected";
  const isError        = connState === "error";
  const isDisconnected = connState === "disconnected";

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] bg-[#0a0a0a]">
        <Link href="/simulate" className="flex items-center gap-1.5 text-[#494847] hover:text-white transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_back</span>
          <span className="text-[10px] font-body">Modules</span>
        </Link>
        <div className="w-px h-4 bg-white/[0.06]" />
        <span className="material-symbols-outlined text-[#6ee7b7]" style={{ fontSize: "16px" }}>swap_vert</span>
        <div>
          <span className="text-sm font-bold font-headline text-white">WebSocket</span>
          <span className="ml-2 text-[8px] font-body text-[#3a3939]">HTTP + Upgrade + Persistent TCP connection</span>
        </div>
        <div className="flex-1" />

        {/* Mode toggle */}
        <div className="flex items-center rounded-[2px] border border-white/[0.06] overflow-hidden">
          {(["virtual", "real"] as AppMode[]).map((m) => (
            <button key={m}
              onClick={() => { setAppMode(m); reset(null); setUrl(PRESETS[m]); }}
              className={`px-3 py-1 text-[9px] font-bold font-body uppercase tracking-[0.15em] transition-all ${
                appMode === m ? "bg-[#1a1919] text-white" : "text-[#494847] hover:text-[#adaaaa]"
              }`}
            >{m}</button>
          ))}
        </div>

        {appMode === "real" && (
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="wss://echo.example.com/ws"
            className="w-72 px-3 py-1.5 text-[10px] font-mono bg-[#111] border border-white/[0.06] rounded-[2px] text-[#adaaaa] placeholder:text-[#333] focus:outline-none focus:border-[#6ee7b7]/30 transition-colors"
          />
        )}

        <div className="flex items-center gap-2">
          {isConnected && (
            <button onClick={disconnect}
              className="text-[10px] font-body text-[#494847] hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>link_off</span>
              Disconnect
            </button>
          )}
          {(isError || isDisconnected) && (
            <button onClick={() => reset(null)}
              className="text-[10px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>refresh</span>
              Reset
            </button>
          )}
          <button onClick={connect}
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
                <motion.span className="w-1.5 h-1.5 rounded-full bg-[#6ee7b7]"
                  animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.7 }} />
                Connecting…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                  {isConnected ? "wifi" : "wifi_off"}
                </span>
                {isConnected ? "Reconnect" : "Connect"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Lifecycle bar ── */}
      <div className="shrink-0 px-4 py-2 border-b border-white/[0.04] flex items-center gap-4 bg-[#090909]">
        <span className="text-[7px] font-body text-[#2a2a2a] uppercase tracking-[0.2em] shrink-0">Transport</span>
        <LifecycleSteps steps={visibleSteps} />
        {(isConnecting || isConnected) && (
          <div className={`ml-auto flex items-center gap-1.5 px-2 py-1 rounded-[2px] border ${
            isConnected ? "border-[#6ee7b7]/20 bg-[#6ee7b7]/[0.04]" : "border-[#ff8f6f]/20 bg-[#ff8f6f]/[0.04]"
          }`}>
            <span className={`material-symbols-outlined ${isConnected ? "text-[#6ee7b7]" : "text-[#ff8f6f]"}`} style={{ fontSize: "10px" }}>
              {isConnected ? "check_circle" : "pending"}
            </span>
            <span className={`text-[7px] font-bold font-body uppercase tracking-[0.15em] ${isConnected ? "text-[#6ee7b7]" : "text-[#ff8f6f]"}`}>
              {isConnected ? "Handshake complete" : "Handshaking…"}
            </span>
          </div>
        )}
        {isError && (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-red-500/20 bg-red-500/[0.04]">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: "10px" }}>error</span>
            <span className="text-[7px] font-bold font-body uppercase tracking-[0.15em] text-red-400">Connection failed</span>
          </div>
        )}
      </div>

      {/* ── Main two-column layout ── */}
      <div className="flex-1 min-h-0 flex">

        {/* Left: conceptual sidebar */}
        <div className="w-52 shrink-0 border-r border-white/[0.04] overflow-y-auto">
          <div className="p-3">
            <ConceptualSidebar connState={connState} messageCount={messages.length} />
          </div>
        </div>

        {/* Right: protocol details + live message area */}
        <div className="flex-1 min-h-0 flex flex-col">

          {/* ── Collapsible protocol details ── */}
          <div className="shrink-0 border-b border-white/[0.04]">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="w-full px-4 py-2 flex items-center gap-2 hover:bg-white/[0.015] transition-colors"
            >
              <span className={`material-symbols-outlined text-[#494847] transition-transform duration-200 ${showDetails ? "" : "-rotate-90"}`} style={{ fontSize: "14px" }}>
                expand_more
              </span>
              <span className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#3a3939]">
                Protocol Handshake
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {response?.statusCode === 101 && (
                  <span className="text-[7px] font-mono text-[#6ee7b7]/40">101 Switching Protocols</span>
                )}
                {isError && (
                  <span className="text-[7px] font-mono text-red-400/60">Failed</span>
                )}
              </div>
            </button>
            <AnimatePresence initial={false}>
              {showDetails && (
                <motion.div
                  key="details"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 space-y-3 max-h-[45vh] overflow-y-auto border-t border-white/[0.04]">
                    <TechnicalFlow request={request} response={response} connState={connState} />
                    {isError && errorMsg && (
                      <div className="px-3 py-2 rounded-[2px] border border-red-500/20 bg-red-500/[0.04] flex items-start gap-2">
                        <span className="material-symbols-outlined text-red-400 shrink-0 mt-px" style={{ fontSize: "12px" }}>error</span>
                        <div>
                          <p className="text-[8px] font-bold font-body text-red-400 mb-0.5">
                            {errorMsg.startsWith("DNS") ? "DNS resolution failed" :
                             errorMsg.startsWith("TCP") ? "TCP connection failed" :
                             errorMsg.startsWith("TLS") ? "TLS handshake failed" :
                             "Handshake failed"}
                          </p>
                          <p className="text-[8px] font-mono text-red-400/70">{errorMsg}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Message area (takes all remaining vertical space) ── */}
          <div className="flex-1 min-h-0 flex flex-col">

            {/* idle state */}
            {isIdle && (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[#1e1e1e]" style={{ fontSize: "32px" }}>swap_vert</span>
                <p className="text-[9px] font-body text-[#2a2a2a] text-center max-w-xs leading-relaxed">
                  Click <span className="text-[#6ee7b7]">Connect</span> to run the upgrade handshake and see live frames.
                </p>
              </div>
            )}

            {/* message log header */}
            {(isConnected || isDisconnected) && (
              <div className="shrink-0 px-4 py-2 border-b border-white/[0.04] flex items-center gap-2 bg-[#090909]">
                <span className="material-symbols-outlined text-[#3a3939]" style={{ fontSize: "12px" }}>forum</span>
                <span className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#3a3939]">
                  Messages
                </span>
                {isDisconnected && (
                  <span className="text-[7px] font-mono text-[#2a2a2a]">— connection closed</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {msgRate > 0 && (
                    <span className="px-1.5 py-0.5 rounded-[2px] border border-[#6ee7b7]/15 bg-[#6ee7b7]/[0.04] text-[7px] font-mono text-[#6ee7b7]/60">
                      {msgRate}/s
                    </span>
                  )}
                  {totalReceived > messages.length && (
                    <span className="text-[7px] font-mono text-[#3a3939]">{totalReceived} total</span>
                  )}
                  {messages.length > 0 && (
                    <span className="text-[7px] font-mono text-[#3a3939]">{messages.length} shown</span>
                  )}
                  {isConnected && (
                    <button
                      onClick={togglePause}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border transition-all text-[7px] font-bold font-body uppercase tracking-[0.1em] ${
                        paused
                          ? "border-[#ff8f6f]/25 bg-[#ff8f6f]/[0.05] text-[#ff8f6f]/70 hover:bg-[#ff8f6f]/[0.08]"
                          : "border-white/[0.06] text-[#3a3939] hover:text-[#494847]"
                      }`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "9px" }}>
                        {paused ? "play_arrow" : "pause"}
                      </span>
                      {paused ? "resume" : "pause"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* messages */}
            <div ref={msgLogRef} className="flex-1 overflow-y-auto px-4 py-3">
              {(isConnected || isDisconnected) && messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[#1e1e1e]" style={{ fontSize: "24px" }}>chat_bubble_outline</span>
                  <p className="text-[8px] font-body text-[#2a2a2a] text-center">
                    {appMode === "virtual"
                      ? "Type a message — the loopback server will echo it back"
                      : "Waiting for frames — streaming servers push data automatically"}
                  </p>
                </div>
              )}
              <div className="space-y-3">
                {messages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} />
                ))}
              </div>
            </div>

            {/* Message input */}
            <AnimatePresence>
              {isConnected && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="shrink-0 border-t border-white/[0.06] bg-[#0a0a0a]"
                >
                  <div className="flex items-center">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={appMode === "virtual" ? "Type a message to echo…" : "Send a frame to the server…"}
                      className="flex-1 px-4 py-3 text-[10px] font-mono bg-transparent text-[#adaaaa] placeholder:text-[#2a2a2a] focus:outline-none"
                      disabled={sending}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || sending}
                      className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-[9px] font-bold font-body uppercase tracking-[0.15em] border-l border-white/[0.06] transition-all ${
                        !input.trim() || sending
                          ? "text-[#2a2a2a] cursor-not-allowed"
                          : "text-[#ff8f6f] hover:bg-[#ff8f6f]/[0.05]"
                      }`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>send</span>
                      Send
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
