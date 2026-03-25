"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────

type HttpVersion = "0.9" | "1.0" | "1.1" | "2" | "3";
type SegKind     = "base" | "new" | "dim";
type StageStatus = "idle" | "active" | "done";

interface Seg      { text: string; kind: SegKind; }
interface StageDef { id: string; label: string; description: string; isNew?: boolean; }
interface SimStage { id: string; label: string; status: StageStatus; durationMs: number; description: string; isNew?: boolean; }

interface SimResult {
  totalMs: number;
  rawRequest?: string;
  rawResponse?: string;
  pseudoHeaders?: Record<string, string>;   // HTTP/2 request pseudo-headers
  response: {
    statusLine?: string;
    headers?: Record<string, string>;
    body: string;
    hasStatusLine: boolean;
    hasHeaders: boolean;
    persistent: boolean;
  };
}

// ── Version metadata ───────────────────────────────────────────

interface VersionMeta {
  version:  HttpVersion;
  year:     number;
  codename: string;
  summary:  string;
  added:    string[];
  missing:  string[];
  badge?:   "limited" | "conceptual";
}

const VERSIONS: VersionMeta[] = [
  {
    version:  "0.9",
    year:     1991,
    codename: "The One-Liner",
    summary:  "A single-line request returns a raw document. No headers, no status codes, no methods except GET.",
    added: [
      "GET method",
      "Request is a single line: method + path",
      "Response is the raw document body",
    ],
    missing: [
      "No HTTP version in request line",
      "No status codes (no 200, 404, 500…)",
      "No request or response headers",
      "No POST, HEAD, or other methods",
      "No Content-Type or MIME types",
      "No persistent connections",
      "No CRLF requirement — early servers accepted bare LF (\\n)",
      "Modern server compatibility — all production servers reject 0.9 requests",
    ],
  },
  {
    version:  "1.0",
    year:     1996,
    codename: "Headers & Status",
    summary:  "Status codes, headers, and MIME types arrive. Every request still opens and closes its own TCP connection.",
    added: [
      "HTTP version string in request line",
      "Response status codes (200, 301, 404, 500…)",
      "Request and response headers",
      "Content-Type / MIME types",
      "Content-Length",
      "POST and HEAD methods",
    ],
    missing: [
      "No persistent connections (closes after every response)",
      "No Host header (no virtual hosting)",
      "No chunked transfer encoding",
      "No cache negotiation headers",
    ],
  },
  {
    version:  "1.1",
    year:     1997,
    codename: "Keep-Alive & Chunking",
    summary:  "Persistent connections, the mandatory Host header, and chunked transfer encoding. Still the dominant version today.",
    added: [
      "Host header (required — enables virtual hosting)",
      "Persistent connections (keep-alive by default)",
      "Chunked transfer encoding (stream before size is known)",
      "Pipelining (multiple requests over one connection)",
      "Cache-Control, ETag, If-None-Match",
      "TLS (HTTPS) became standard practice",
    ],
    missing: [
      "Head-of-line blocking at TCP level",
      "Headers are plaintext (no compression)",
      "One active request at a time per connection",
    ],
  },
  {
    version:  "2",
    year:     2015,
    codename: "Binary & Multiplexed",
    badge:    "limited",
    summary:  "HTTP/2 is not a text protocol. Requests are binary frames. Multiple streams share one connection. Headers are HPACK-compressed.",
    added: [
      "Binary framing layer (not human-readable text)",
      "Multiplexed streams over a single TCP connection",
      "HPACK header compression",
      "Server push (proactively send resources)",
      "Stream prioritization",
      "Mandatory TLS in practice (ALPN h2)",
    ],
    missing: [
      "Head-of-line blocking still exists at TCP level",
      "Single TCP connection — a packet loss stalls all streams",
      "Raw wire bytes are not human-readable",
    ],
  },
  {
    version:  "3",
    year:     2022,
    codename: "QUIC over UDP",
    badge:    "conceptual",
    summary:  "HTTP/3 runs over QUIC — a UDP-based transport. TLS is built into QUIC. Streams are independent. No TCP head-of-line blocking.",
    added: [
      "Runs on QUIC (UDP) instead of TCP",
      "TLS 1.3 built directly into QUIC — no separate handshake",
      "0-RTT connection resumption",
      "Independent streams — packet loss only stalls one stream",
      "Connection migration (survives network change)",
    ],
    missing: [
      "No stable Node.js QUIC API (no live simulation possible)",
      "UDP middlebox issues — some networks block QUIC",
      "Higher CPU usage (QUIC userspace vs kernel TCP)",
    ],
  },
];

// ── Wire format: orange = new in this version, gray = inherited, dim = syntax ──

const REQUEST_SEGS: Record<"0.9" | "1.0" | "1.1", Seg[]> = {
  "0.9": [
    { text: "GET /hello.html", kind: "base" },
    { text: "\r\n",            kind: "dim"  },
  ],
  "1.0": [
    { text: "GET /hello.html", kind: "base" },
    { text: " HTTP/1.0",       kind: "new"  },
    { text: "\r\n",            kind: "dim"  },
    { text: "Accept: */*\r\n", kind: "new"  },
    { text: "User-Agent: ObsidianSim/1.0\r\n", kind: "new" },
    { text: "\r\n",            kind: "dim"  },
  ],
  "1.1": [
    { text: "GET /hello.html HTTP/1.1", kind: "base" },
    { text: "\r\n",                     kind: "dim"  },
    { text: "Host: localhost\r\n",      kind: "new"  },
    { text: "Connection: keep-alive\r\n", kind: "new" },
    { text: "Accept: */*\r\n",          kind: "base" },
    { text: "User-Agent: ObsidianSim/1.1\r\n", kind: "base" },
    { text: "\r\n",                     kind: "dim"  },
  ],
};

const RESPONSE_SEGS: Record<"0.9" | "1.0" | "1.1", Seg[]> = {
  "0.9": [
    { text: "<html>\n  <body>Hello World</body>\n</html>", kind: "base" },
  ],
  "1.0": [
    { text: "HTTP/1.0 200 OK\r\n",         kind: "new"  },
    { text: "Content-Type: text/html\r\n", kind: "new"  },
    { text: "Content-Length: 38\r\n",      kind: "new"  },
    { text: "Server: ObsidianSim/1.0\r\n", kind: "new"  },
    { text: "\r\n",                        kind: "dim"  },
    { text: "<html>\n  <body>Hello World</body>\n</html>", kind: "base" },
  ],
  "1.1": [
    { text: "HTTP/1.1 200 OK\r\n",              kind: "base" },
    { text: "Content-Type: text/html\r\n",      kind: "base" },
    { text: "Transfer-Encoding: chunked\r\n",   kind: "new"  },
    { text: "Connection: keep-alive\r\n",       kind: "new"  },
    { text: "Server: ObsidianSim/1.1\r\n",      kind: "base" },
    { text: "\r\n",                             kind: "dim"  },
    { text: "26",                               kind: "new"  },
    { text: "\r\n",                             kind: "dim"  },
    { text: "<html>\n  <body>Hello World</body>\n</html>", kind: "base" },
    { text: "\r\n0\r\n\r\n",                    kind: "new"  },
  ],
};

// ── Lifecycle stage pills (educational — not tied to run output) ──

const STAGE_DEFS: Record<HttpVersion, StageDef[]> = {
  "0.9": [
    { id: "dns",      label: "DNS",      description: "Resolve hostname to IP address" },
    { id: "tcp",      label: "TCP",      description: "Open TCP connection (3-way handshake)" },
    { id: "request",  label: "Request",  description: "Send: GET /path  (one line, no headers)" },
    { id: "response", label: "Response", description: "Receive raw document body — no envelope" },
    { id: "close",    label: "Close",    description: "Connection always closes after response" },
  ],
  "1.0": [
    { id: "dns",      label: "DNS",      description: "Resolve hostname to IP address" },
    { id: "tcp",      label: "TCP",      description: "Open TCP connection (3-way handshake)" },
    { id: "request",  label: "Request",  description: "Send: GET /path HTTP/1.0 + headers" },
    { id: "response", label: "Response", description: "Receive: status line + headers + body", isNew: true },
    { id: "close",    label: "Close",    description: "Connection closes — no keep-alive" },
  ],
  "1.1": [
    { id: "dns",      label: "DNS",      description: "Resolve hostname to IP address" },
    { id: "tcp",      label: "TCP",      description: "Open TCP connection (3-way handshake)" },
    { id: "tls",      label: "TLS",      description: "TLS handshake — HTTPS became standard practice", isNew: true },
    { id: "request",  label: "Request",  description: "Send: GET /path HTTP/1.1 + Host header" },
    { id: "ttfb",     label: "TTFB",     description: "Wait for first byte — server processing time", isNew: true },
    { id: "response", label: "Response", description: "Receive chunked body — size unknown upfront" },
    { id: "persist",  label: "Keep-Alive", description: "Connection stays open for the next request", isNew: true },
  ],
  "2": [
    { id: "dns",      label: "DNS",       description: "Resolve hostname to IP address" },
    { id: "tcp",      label: "TCP",       description: "Single TCP connection — all streams share it" },
    { id: "tls",      label: "TLS+ALPN",  description: "TLS with ALPN negotiation — server advertises h2", isNew: true },
    { id: "settings", label: "SETTINGS",  description: "Both sides exchange capabilities: max frame size, window size, header table size", isNew: true },
    { id: "headers",  label: "HEADERS",   description: "Binary HPACK-compressed request headers as a frame on stream 1", isNew: true },
    { id: "data",     label: "DATA",      description: "Response body arrives as one or more DATA frames", isNew: true },
    { id: "close",    label: "GOAWAY",    description: "Graceful connection shutdown — server sends GOAWAY frame", isNew: true },
  ],
  "3": [
    { id: "dns",      label: "DNS",        description: "Resolve hostname to IP address" },
    { id: "quic",     label: "QUIC+TLS",   description: "UDP-based QUIC handshake with TLS 1.3 built-in — replaces TCP + TLS entirely", isNew: true },
    { id: "headers",  label: "HEADERS",    description: "HTTP/3 HEADERS frame (QPACK-compressed) on an independent QUIC stream", isNew: true },
    { id: "data",     label: "DATA",       description: "Response DATA frames — each stream is independent, no TCP blocking", isNew: true },
    { id: "close",    label: "Close",      description: "QUIC connection survives network changes unlike TCP" },
  ],
};

// Compute run-mode stage defs dynamically based on URL (real vs loopback) and TLS
function getRunStageDefs(version: HttpVersion, url: string): StageDef[] {
  const isReal = url.trim() !== "";

  if (version === "2") {
    const stages: StageDef[] = [];
    if (isReal) {
      stages.push({ id: "dns",      label: "DNS",      description: "Resolve hostname to IP" });
      stages.push({ id: "tcp",      label: "TCP",      description: "Open TCP connection" });
      stages.push({ id: "tls",      label: "TLS+ALPN", description: "TLS — ALPN negotiates h2", isNew: true });
    } else {
      stages.push({ id: "tcp",      label: "TCP",      description: "Connect loopback h2c socket" });
    }
    stages.push({ id: "settings", label: "SETTINGS", description: "HTTP/2 capability exchange", isNew: true });
    stages.push({ id: "headers",  label: "HEADERS",  description: "HPACK-compressed request frame", isNew: true });
    stages.push({ id: "data",     label: "DATA",     description: "Response DATA frame(s)", isNew: true });
    stages.push({ id: "close",    label: "Close",    description: "GOAWAY + session close" });
    return stages;
  }

  const useTls = isReal && (url.trim().startsWith("https://") || (!url.trim().startsWith("http://") && version === "1.1"));
  const stages: StageDef[] = [];

  if (isReal) {
    stages.push({ id: "dns", label: "DNS", description: "Resolve hostname to IP address" });
  }
  stages.push({ id: "tcp", label: "TCP", description: isReal ? "Open TCP connection" : "Connect loopback socket" });
  if (useTls) {
    stages.push({ id: "tls", label: "TLS", description: "TLS handshake", isNew: version === "1.1" });
  }
  stages.push({ id: "request",  label: "Request",  description: version === "0.9" ? "Write: GET /path↵  (one line, no headers)" : "Write request line + headers" });
  stages.push({ id: "response", label: "Response", description: "Read response until connection closes", isNew: version !== "0.9" });
  if (!isReal && version === "1.1") {
    stages.push({ id: "persist", label: "Keep-Alive", description: "Connection stays open — server closes after 250ms", isNew: true });
  }
  stages.push({ id: "close", label: "Close", description: "Connection closed" });
  return stages;
}

// ── Helpers ────────────────────────────────────────────────────

// Render \r\n as visible ↵ followed by a real newline so the pre wraps correctly
function renderWire(text: string) {
  return text.replace(/\r\n/g, "↵\n").replace(/\r/g, "↵");
}

// Parse raw HTTP request bytes into display segments
function parseRequestSegs(raw: string): Seg[] {
  const sep = raw.indexOf("\r\n\r\n");
  const headerPart = sep === -1 ? raw : raw.slice(0, sep);
  const lines = headerPart.split("\r\n");
  const segs: Seg[] = [];

  lines.forEach((line, i) => {
    segs.push({ text: line, kind: i === 0 ? "new" : "base" }); // first line = request line (orange)
    segs.push({ text: "\r\n", kind: "dim" });
  });
  if (sep !== -1) segs.push({ text: "\r\n", kind: "dim" }); // blank line before body

  return segs;
}

// Parse raw HTTP response bytes into display segments
function parseResponseSegs(raw: string): Seg[] {
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1) {
    // HTTP/0.9 style — no headers at all
    const truncated = raw.length > 1200 ? raw.slice(0, 1200) + "\n…" : raw;
    return [{ text: truncated, kind: "base" }];
  }

  const headerPart = raw.slice(0, sep);
  const body       = raw.slice(sep + 4);
  const lines      = headerPart.split("\r\n");
  const segs: Seg[] = [];

  lines.forEach((line, i) => {
    segs.push({ text: line, kind: i === 0 ? "new" : "base" }); // status line = orange
    segs.push({ text: "\r\n", kind: "dim" });
  });
  segs.push({ text: "\r\n", kind: "dim" }); // blank line

  if (body) {
    const truncated = body.length > 1200 ? body.slice(0, 1200) + "\n…" : body;
    segs.push({ text: truncated, kind: "base" });
  }

  return segs;
}

// ── Page ───────────────────────────────────────────────────────

export default function HttpVersionsPage() {
  const [selected,  setSelected]  = useState<HttpVersion>("0.9");
  const [url,       setUrl]       = useState("");
  const [simStages, setSimStages] = useState<SimStage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [result,    setResult]    = useState<SimResult | null>(null);
  const [runError,  setRunError]  = useState<string | null>(null);
  const abortRef = useRef(false);

  const meta      = VERSIONS.find((v) => v.version === selected)!;
  const stageDefs = STAGE_DEFS[selected];

  const selectVersion = (v: HttpVersion) => {
    abortRef.current = true;
    setSelected(v);
    setSimStages([]);
    setResult(null);
    setRunError(null);
    setIsRunning(false);
    // Reset URL when switching version (0.9/1.0 don't default to https)
    setUrl("");
  };

  const run = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setResult(null);
    setRunError(null);
    abortRef.current = false;

    const defs = getRunStageDefs(selected, url);
    const init: SimStage[] = defs.map((d) => ({
      id: d.id, label: d.label, status: "idle", durationMs: 0,
      description: d.description, isNew: d.isNew,
    }));
    setSimStages(init);
    const stages = [...init];

    try {
      const qs = new URLSearchParams({ version: selected });
      if (url.trim()) qs.set("url", url.trim());
      const res = await fetch(`/api/http-versions?${qs.toString()}`);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        if (abortRef.current) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "phase") {
            const phase  = event.phase as string;
            const status = event.status as string;
            const idx    = stages.findIndex((s) => s.id === phase);
            if (idx === -1) continue;

            stages[idx] = {
              ...stages[idx],
              status:     status === "active" ? "active" : "done",
              durationMs: status === "done" ? (event.durationMs as number ?? 0) : 0,
            };
            setSimStages([...stages]);

          } else if (event.type === "result") {
            setResult({
              totalMs:       event.totalMs as number,
              rawRequest:    event.rawRequest as string | undefined,
              rawResponse:   event.rawResponse as string | undefined,
              pseudoHeaders: event.pseudoHeaders as Record<string, string> | undefined,
              response: {
                statusLine:    event.statusLine as string | undefined,
                headers:       event.headers as Record<string, string> | undefined,
                body:          event.body as string,
                hasStatusLine: event.hasStatusLine as boolean,
                hasHeaders:    event.hasHeaders as boolean,
                persistent:    event.persistent as boolean,
              },
            });

          } else if (event.type === "error") {
            setRunError(event.message as string);
          }
        }
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, selected, url]);

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-white/5 bg-[#0e0e0e]/90 backdrop-blur-xl shrink-0">
        <Link
          href="/simulate/http"
          className="flex items-center gap-1.5 text-[#adaaaa] hover:text-white transition-colors text-sm font-body"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          HTTP
        </Link>
        <span className="text-[#494847]">/</span>
        <span className="text-[#ff8f6f] font-headline font-bold text-sm uppercase tracking-widest">
          Protocol Versions
        </span>
      </header>

      {/* ── Version tabs ── */}
      <div className="flex border-b border-white/5 shrink-0 px-6">
        {VERSIONS.map((v) => (
          <button
            key={v.version}
            onClick={() => selectVersion(v.version)}
            className={`flex flex-col items-start gap-0.5 px-5 py-4 border-b-2 mr-1 transition-all ${
              selected === v.version
                ? "border-[#ff8f6f]"
                : "border-transparent hover:border-white/10"
            }`}
          >
            <span className={`text-[9px] font-body uppercase tracking-[0.2em] ${
              selected === v.version ? "text-[#ff8f6f]/60" : "text-[#333]"
            }`}>{v.year}</span>
            <span className={`font-headline font-bold text-lg leading-none ${
              selected === v.version ? "text-white" : "text-[#494847]"
            }`}>HTTP/{v.version}</span>
            <span className={`text-[9px] font-body mt-0.5 ${
              selected === v.version ? "text-[#adaaaa]" : "text-[#2e2e2e]"
            }`}>{v.codename}</span>
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="w-72 shrink-0 border-r border-white/5 flex flex-col overflow-y-auto">

          <div className="p-5 border-b border-white/5">
            <p className="text-[11px] font-body text-[#adaaaa] leading-relaxed">{meta.summary}</p>
          </div>

          <div className="p-5 border-b border-white/5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-3">
              What it added
            </span>
            <ul className="space-y-1.5">
              {meta.added.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-[#ff8f6f] shrink-0 text-[11px] font-bold leading-[1.6]">+</span>
                  <span className="text-[10px] font-body text-[#adaaaa] leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 border-b border-white/5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-3">
              What it lacked
            </span>
            <ul className="space-y-1.5">
              {meta.missing.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-[#3a3939] shrink-0 text-[11px] font-bold leading-[1.6]">–</span>
                  <span className="text-[10px] font-body text-[#3a3939] leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-5 mt-auto space-y-3">
            {selected === "3" ? (
              <div className="border border-blue-500/10 bg-blue-500/5 rounded-sm px-3 py-3">
                <p className="text-[9px] font-bold font-body uppercase tracking-widest text-blue-400/60 mb-1.5">
                  📘 Conceptual Only
                </p>
                <p className="text-[9px] font-body text-[#494847] leading-relaxed">
                  Node.js has no stable QUIC/HTTP3 API. No live execution is possible.
                </p>
              </div>
            ) : (
              <>
                {/* URL input */}
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-1.5">
                    Target URL
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") run(); }}
                    placeholder={selected === "2" ? "example.com (HTTPS + ALPN)" : selected === "1.1" ? "example.com" : "example.com (port 80)"}
                    disabled={isRunning}
                    className="w-full bg-[#111] border border-white/8 rounded-sm px-3 py-2 text-[10px] font-mono text-[#adaaaa] placeholder-[#2e2e2e] focus:outline-none focus:border-[#ff8f6f]/40 disabled:opacity-40 transition-colors"
                  />
                  {url.trim() === "" && (
                    <p className="text-[8px] font-body text-[#2e2e2e] mt-1">
                      {selected === "2" ? "Empty = loopback h2c server" : "Empty = loopback server"}
                    </p>
                  )}
                  {selected === "0.9" && url.trim() !== "" && (
                    <p className="text-[8px] font-body text-[#494847] mt-1 leading-relaxed">
                      Modern servers ignore HTTP/0.9 format — watch what comes back
                    </p>
                  )}
                  {selected === "2" && url.trim() !== "" && (
                    <p className="text-[8px] font-body text-[#494847] mt-1 leading-relaxed">
                      Will verify ALPN negotiated h2 — fails if server doesn&apos;t support HTTP/2
                    </p>
                  )}
                </div>

                <button
                  onClick={run}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#ff8f6f] text-[#5c1400] font-bold font-body text-[10px] uppercase tracking-widest rounded-sm hover:bg-[#ff7851] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isRunning ? "hourglass_empty" : "play_arrow"}
                  </span>
                  {isRunning ? "Running…" : "Run"}
                </button>

                {runError && (
                  <p className="text-[9px] font-body text-red-400/70 text-center leading-relaxed">
                    {runError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: version-specific panel */}
        <div className="flex-1 flex flex-col overflow-y-auto gap-6 p-6">

          {selected === "2" ? (
            <Http2Panel
              url={url} simStages={simStages} result={result}
              stageDefs={stageDefs}
            />
          ) : selected === "3" ? (
            <Http3Panel stageDefs={stageDefs} />
          ) : (
            <>
              {/* Wire format side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                <WirePanel
                  title="Request"
                  segs={REQUEST_SEGS[selected as "0.9" | "1.0" | "1.1"]}
                  rawText={url.trim() && result?.rawRequest ? result.rawRequest : undefined}
                  rawKind="request"
                />
                <WirePanel
                  title="Response"
                  segs={RESPONSE_SEGS[selected as "0.9" | "1.0" | "1.1"]}
                  rawText={url.trim() && result?.rawResponse ? result.rawResponse : undefined}
                  rawKind="response"
                />
              </div>

              {/* Lifecycle stage pills */}
              <LifecyclePills stageDefs={stageDefs} />

              {/* Run output */}
              {simStages.length > 0 && (
                <RunOutput url={url} simStages={simStages} result={result} version={selected} />
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── WirePanel ──────────────────────────────────────────────────

interface WirePanelProps {
  title:    string;
  segs:     Seg[];
  rawText?: string;  // if provided, overrides segs with real bytes
  rawKind?: "request" | "response";
}

function WirePanel({ title, segs, rawText, rawKind }: WirePanelProps) {
  const isReal       = !!rawText;
  const displaySegs  = isReal
    ? (rawKind === "request" ? parseRequestSegs(rawText!) : parseResponseSegs(rawText!))
    : segs;

  return (
    <div className="bg-[#111] border border-white/5 rounded-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847]">{title}</span>
        {isReal && (
          <span className="text-[8px] font-body text-[#ff8f6f]/50 uppercase tracking-widest">live</span>
        )}
      </div>

      <pre className="px-4 py-4 text-[11px] font-mono leading-[1.8] overflow-x-auto flex-1">
        {displaySegs.map((seg, i) => (
          <span
            key={i}
            className={
              seg.kind === "new"  ? "text-[#ff8f6f]" :
              seg.kind === "dim"  ? "text-[#2e2e2e]" :
              "text-[#777575]"
            }
          >
            {renderWire(seg.text)}
          </span>
        ))}
      </pre>

      <div className="flex items-center gap-5 px-4 py-2 border-t border-white/5">
        {isReal ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff8f6f]" />
              <span className="text-[8px] font-body text-[#333]">{rawKind === "request" ? "request line" : "status line"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#494847]" />
              <span className="text-[8px] font-body text-[#333]">headers / body</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2e2e2e]" />
              <span className="text-[8px] font-body text-[#333]">separators</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff8f6f]" />
              <span className="text-[8px] font-body text-[#333]">new in this version</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#494847]" />
              <span className="text-[8px] font-body text-[#333]">inherited</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2e2e2e]" />
              <span className="text-[8px] font-body text-[#333]">protocol syntax</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Stage color palette (mirrors /http page constants) ──────────

const STAGE_DOT: Record<string, string> = {
  dns:      "bg-blue-500",
  tcp:      "bg-purple-500",
  tls:      "bg-yellow-500",
  request:  "bg-orange-400",
  response: "bg-green-500",
  ttfb:     "bg-[#ff8f6f]",
  persist:  "bg-[#ff8f6f]",
  settings: "bg-cyan-500",
  headers:  "bg-orange-400",
  data:     "bg-green-500",
  quic:     "bg-cyan-400",
  close:    "bg-[#494847]",
};

const STAGE_TEXT: Record<string, string> = {
  dns:      "text-blue-400",
  tcp:      "text-purple-400",
  tls:      "text-yellow-400",
  request:  "text-orange-400",
  response: "text-green-400",
  ttfb:     "text-[#ff8f6f]",
  persist:  "text-[#ff8f6f]",
  settings: "text-cyan-400",
  headers:  "text-orange-400",
  data:     "text-green-400",
  quic:     "text-cyan-300",
  close:    "text-[#494847]",
};

const STAGE_BAR: Record<string, string> = {
  dns:      "bg-blue-500/50",
  tcp:      "bg-purple-500/50",
  tls:      "bg-yellow-500/50",
  request:  "bg-orange-400/50",
  response: "bg-green-500/50",
  ttfb:     "bg-[#ff8f6f]/50",
  persist:  "bg-[#ff8f6f]/50",
  settings: "bg-cyan-500/50",
  headers:  "bg-orange-400/50",
  data:     "bg-green-500/50",
  quic:     "bg-cyan-400/50",
  close:    "bg-[#494847]/50",
};

// ── StageRow ───────────────────────────────────────────────────

function StageRow({ stage }: { stage: SimStage }) {
  const maxBarMs = 300;
  const dot  = STAGE_DOT[stage.id]  ?? "bg-[#494847]";
  const text = STAGE_TEXT[stage.id] ?? "text-[#494847]";
  const bar  = STAGE_BAR[stage.id]  ?? "bg-[#494847]/50";

  return (
    <div className="flex items-center gap-3 h-5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
        stage.status === "done"   ? dot :
        stage.status === "active" ? `${dot} animate-pulse` :
        "bg-[#252525]"
      }`} />

      <span className={`text-[9px] font-bold font-body uppercase tracking-widest w-20 shrink-0 transition-colors ${
        stage.status === "done"   ? "text-[#adaaaa]" :
        stage.status === "active" ? text :
        "text-[#2e2e2e]"
      }`}>
        {stage.label}
      </span>

      <div className="flex-1 h-px bg-white/5 rounded-full overflow-hidden">
        {stage.status === "done" && stage.durationMs > 0 && (
          <div
            className={`h-full ${bar} rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(100, (stage.durationMs / maxBarMs) * 100)}%` }}
          />
        )}
        {stage.status === "active" && (
          <div className={`h-full ${bar} rounded-full animate-pulse w-1/2`} />
        )}
      </div>

      <span className={`text-[9px] font-mono tabular-nums w-10 text-right shrink-0 transition-colors ${
        stage.status === "done" ? "text-[#494847]" : "text-transparent"
      }`}>
        {stage.durationMs > 0 ? `${stage.durationMs}ms` : stage.status === "done" ? "—" : ""}
      </span>

      {stage.isNew && stage.status !== "idle" && (
        <span className="text-[7px] font-bold font-body uppercase tracking-widest text-[#ff8f6f]/40 shrink-0 w-6">
          new
        </span>
      )}
    </div>
  );
}

// ── ResultPanel ────────────────────────────────────────────────

function ResultPanel({ result }: { result: SimResult }) {
  const { response, totalMs, rawRequest, rawResponse } = result;
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="border border-white/5 bg-[#0d0d0d] rounded-sm overflow-hidden">

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-3">
          {response.hasStatusLine ? (
            <span className="text-[10px] font-mono text-green-400/80">{response.statusLine}</span>
          ) : (
            <span className="text-[10px] font-body text-[#3a3939] italic">
              no status line — HTTP/0.9 sends raw body only
            </span>
          )}
          {response.persistent && (
            <span className="text-[8px] font-bold font-body uppercase tracking-widest text-[#ff8f6f]/60 border border-[#ff8f6f]/20 px-1.5 py-0.5 rounded-sm">
              keep-alive
            </span>
          )}
          {!response.persistent && response.hasStatusLine && (
            <span className="text-[8px] font-bold font-body uppercase tracking-widest text-[#494847] border border-white/5 px-1.5 py-0.5 rounded-sm">
              connection: close
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-[#494847] tabular-nums">{totalMs}ms total</span>
          {(rawRequest || rawResponse) && (
            <button
              onClick={() => setShowRaw((p) => !p)}
              className="text-[8px] font-bold font-body uppercase tracking-widest text-[#494847] hover:text-[#adaaaa] transition-colors"
            >
              {showRaw ? "parsed" : "raw bytes"}
            </button>
          )}
        </div>
      </div>

      {showRaw ? (
        /* Raw bytes view */
        <div className="p-4 space-y-3">
          {rawRequest && (
            <div>
              <span className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#ff8f6f]/50 block mb-1.5">sent</span>
              <pre className="text-[10px] font-mono text-[#ff8f6f]/70 leading-relaxed whitespace-pre-wrap break-all">
                {renderWire(rawRequest)}
              </pre>
            </div>
          )}
          {rawResponse && (
            <div>
              <span className="text-[8px] font-bold font-body uppercase tracking-[0.2em] text-[#adaaaa]/50 block mb-1.5">received</span>
              <pre className="text-[10px] font-mono text-[#777575] leading-relaxed whitespace-pre-wrap break-all">
                {renderWire(rawResponse)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Response headers */}
          {response.hasHeaders && response.headers && (
            <div className="px-4 py-2.5 border-b border-white/5 space-y-1">
              {Object.entries(response.headers).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px] font-mono">
                  <span className="text-[#494847]">{k}:</span>
                  <span className="text-[#adaaaa]">{v}</span>
                </div>
              ))}
            </div>
          )}
          {!response.hasHeaders && (
            <div className="px-4 py-2.5 border-b border-white/5">
              <span className="text-[9px] font-body text-[#2e2e2e] italic">
                no headers — HTTP/0.9 has no concept of metadata
              </span>
            </div>
          )}

          {/* Body */}
          <pre className="px-4 py-3 text-[10px] font-mono text-[#494847] leading-relaxed">
            {response.body}
          </pre>
        </>
      )}
    </div>
  );
}

// ── LifecyclePills (shared sub-component) ──────────────────────

function LifecyclePills({ stageDefs }: { stageDefs: StageDef[] }) {
  return (
    <div>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-4">
        Lifecycle — {stageDefs.length} stage{stageDefs.length !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center flex-wrap gap-0">
        {stageDefs.map((stage, i) => (
          <div key={stage.id} className="flex items-center">
            {i > 0 && <div className="w-5 h-px bg-white/[0.08] shrink-0" />}
            <div className={`group relative flex flex-col items-center gap-1 px-4 py-2.5 rounded-sm border ${
              stage.isNew ? "border-[#ff8f6f]/25 bg-[#ff8f6f]/5" : "border-white/5 bg-[#1a1919]"
            }`}>
              <span className={`text-[9px] font-bold font-body uppercase tracking-widest ${
                stage.isNew ? "text-[#ff8f6f]" : "text-[#adaaaa]"
              }`}>{stage.label}</span>
              {stage.isNew && (
                <span className="text-[7px] font-bold font-body uppercase tracking-widest text-[#ff8f6f]/40">new</span>
              )}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none w-max max-w-[200px]">
                <div className="bg-[#1a1919] border border-white/10 rounded-sm px-2.5 py-2">
                  <p className="text-[9px] font-body text-[#adaaaa] leading-relaxed text-center">{stage.description}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RunOutput (shared sub-component) ──────────────────────────

function RunOutput({ url, simStages, result, version }: {
  url: string;
  simStages: SimStage[];
  result: SimResult | null;
  version: HttpVersion;
}) {
  const isRealMode = url.trim() !== "";
  const rawResponse = result?.rawResponse ?? "";

  // Detect HTTP/0.9 real-mode outcomes — the server will almost never honour a 0.9 request
  const serverRejected = version === "0.9" && isRealMode && result !== null &&
    rawResponse.trimStart().startsWith("HTTP/");
  const serverSilent   = version === "0.9" && isRealMode && result !== null &&
    rawResponse === "";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847]">
          {url.trim() ? `Run — ${url.trim()}` : "Run — loopback 127.0.0.1"}
        </span>
        {!url.trim() && <span className="text-[8px] font-body text-[#2e2e2e]">no DNS · no external network</span>}
      </div>
      <div className="space-y-1.5">
        {simStages.map((s) => <StageRow key={s.id} stage={s} />)}
      </div>

      {/* HTTP/0.9 real-mode teaching callouts */}
      {serverRejected && (
        <div className="border border-yellow-500/15 bg-yellow-500/5 rounded-sm px-4 py-3 space-y-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-yellow-400/70 block">
            Expected — server rejected the HTTP/0.9 request
          </span>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            Modern servers parse the request line looking for a version token (<code className="text-[#777575]">GET /path HTTP/1.x</code>).
            When there is no version, they respond with HTTP/1.x anyway — usually a{" "}
            <code className="text-yellow-400/70">400 Bad Request</code> — then close the connection.
          </p>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            This is correct behaviour. HTTP/0.9 has been dead since the mid-1990s. No production server accepts it.
            Toggle <span className="text-[#ff8f6f]">raw bytes</span> below to see the full rejection response.
          </p>
        </div>
      )}
      {serverSilent && (
        <div className="border border-yellow-500/15 bg-yellow-500/5 rounded-sm px-4 py-3 space-y-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-yellow-400/70 block">
            Expected — server sent nothing back
          </span>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            Some servers wait for a blank line (<code className="text-[#777575]">\r\n\r\n</code>) that marks the end of
            HTTP/1.x headers before processing a request. An HTTP/0.9 request never sends that blank line, so the server
            holds the connection open until its own idle timeout fires and closes it — leaving you with an empty response.
          </p>
        </div>
      )}

      {result && <ResultPanel result={result} />}
    </div>
  );
}

// ── Http2Panel ─────────────────────────────────────────────────

const H2_VS_H1: [string, string][] = [
  ["Text-based",               "Binary framing"],
  ["One request at a time",    "Multiplexed streams"],
  ["Repeated headers",         "Compressed (HPACK)"],
  ["Multiple TCP connections", "Single TCP connection"],
  ["Optional TLS",             "TLS required (ALPN h2)"],
];

function Http2Panel({
  url, simStages, result, stageDefs,
}: {
  url: string;
  simStages: SimStage[];
  result: SimResult | null;
  stageDefs: StageDef[];
}) {
  return (
    <>
      {/* Explanation cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Binary framing */}
        <div className="bg-[#111] border border-white/5 rounded-sm p-4 space-y-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block">
            Why no raw wire bytes
          </span>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            HTTP/1.x is plain text — every byte is human-readable and manually reproducible.
          </p>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            HTTP/2 uses a <span className="text-[#ff8f6f]">binary framing layer</span>. Headers are
            HPACK-compressed. The wire is not text. The runtime (Node.js <code className="text-[#777575]">node:http2</code>)
            handles framing internally — there is no string you can print.
          </p>
          <div className="border border-yellow-500/10 bg-yellow-500/5 rounded-sm px-3 py-2">
            <p className="text-[9px] font-body text-yellow-400/70 leading-relaxed">
              ⚠ A wire-level frame visualizer would be needed to show the actual binary. That&apos;s a
              future feature — not available yet.
            </p>
          </div>
        </div>

        {/* Comparison table */}
        <div className="bg-[#111] border border-white/5 rounded-sm p-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-3">
            HTTP/1.1 → HTTP/2
          </span>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-[8px] font-bold uppercase tracking-widest text-[#333] pb-2 pr-4">HTTP/1.1</th>
                <th className="text-left text-[8px] font-bold uppercase tracking-widest text-[#ff8f6f]/40 pb-2">HTTP/2</th>
              </tr>
            </thead>
            <tbody className="space-y-1">
              {H2_VS_H1.map(([old, next]) => (
                <tr key={old}>
                  <td className="text-[9px] font-mono text-[#3a3939] pr-4 py-0.5 align-top">{old}</td>
                  <td className="text-[9px] font-mono text-[#adaaaa] py-0.5 align-top">{next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* What changes — frame concept */}
      <div className="bg-[#111] border border-white/5 rounded-sm p-4">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-3">
          How it&apos;s implemented here
        </span>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Server", icon: "dns", text: "node:http2 createServer() — responds to HEADERS frames" },
            { label: "Client", icon: "cable", text: "http2.connect() — handles connection preface + SETTINGS" },
            { label: "Observe", icon: "visibility", text: "Stream ID, pseudo-headers (:method, :path), timing per frame type" },
          ].map(({ label, icon, text }) => (
            <div key={label} className="flex gap-2">
              <span className="material-symbols-outlined text-[#494847] text-base shrink-0 mt-0.5">{icon}</span>
              <div>
                <span className="text-[9px] font-bold font-body uppercase tracking-widest text-[#494847] block mb-1">{label}</span>
                <p className="text-[9px] font-body text-[#3a3939] leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Killer line */}
      <p className="text-[10px] font-body text-[#2e2e2e] italic text-center">
        HTTP/1.x can be implemented manually.&nbsp;&nbsp;
        <span className="text-[#494847]">HTTP/2 must be observed.</span>&nbsp;&nbsp;
        HTTP/3 must be understood.
      </p>

      {/* Lifecycle */}
      <LifecyclePills stageDefs={stageDefs} />

      {/* Run output */}
      {simStages.length > 0 && (
        <RunOutput url={url} simStages={simStages} result={result} version="2" />
      )}
    </>
  );
}

// ── Http3Panel ─────────────────────────────────────────────────

const H3_VS_H2: [string, string][] = [
  ["TCP",                      "UDP (QUIC)"],
  ["Head-of-line blocking",    "Independent streams"],
  ["Separate TLS handshake",   "TLS 1.3 built into QUIC"],
  ["Connection resets",        "Connection migration"],
  ["~3 round trips to start",  "0-RTT resumption possible"],
];

const CONCEPTUAL_FLOW = [
  { id: "dns",  label: "DNS",          color: "text-blue-400",   desc: "Resolve hostname" },
  { id: "quic", label: "QUIC + TLS",   color: "text-cyan-400",   desc: "UDP handshake + TLS 1.3 combined — replaces TCP + TLS separately" },
  { id: "req",  label: "HEADERS",      color: "text-orange-400", desc: "HTTP/3 HEADERS frame (QPACK-compressed) on stream 0" },
  { id: "data", label: "DATA",         color: "text-green-400",  desc: "HTTP/3 DATA frame(s) — each QUIC stream is independent" },
];

function Http3Panel({ stageDefs }: { stageDefs: StageDef[] }) {
  return (
    <>
      {/* Explanation cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* QUIC explanation */}
        <div className="bg-[#111] border border-white/5 rounded-sm p-4 space-y-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block">
            Why no live simulation
          </span>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            HTTP/3 runs on <span className="text-cyan-400">QUIC</span>, a UDP-based transport protocol.
            It is not TCP. It is not something Node.js can simulate with <code className="text-[#777575]">node:net</code>.
          </p>
          <p className="text-[10px] font-body text-[#adaaaa] leading-relaxed">
            Node.js has no stable QUIC/HTTP3 API in its standard library. Creating a real HTTP/3
            server or client requires external binaries outside the scope of this simulator.
          </p>
          <div className="border border-blue-500/10 bg-blue-500/5 rounded-sm px-3 py-2">
            <p className="text-[9px] font-body text-blue-400/70 leading-relaxed">
              📘 This section is conceptual only — no socket, no real execution.
            </p>
          </div>
        </div>

        {/* Comparison table */}
        <div className="bg-[#111] border border-white/5 rounded-sm p-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-3">
            HTTP/2 → HTTP/3
          </span>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-[8px] font-bold uppercase tracking-widest text-[#333] pb-2 pr-4">HTTP/2</th>
                <th className="text-left text-[8px] font-bold uppercase tracking-widest text-cyan-400/40 pb-2">HTTP/3</th>
              </tr>
            </thead>
            <tbody>
              {H3_VS_H2.map(([old, next]) => (
                <tr key={old}>
                  <td className="text-[9px] font-mono text-[#3a3939] pr-4 py-0.5 align-top">{old}</td>
                  <td className="text-[9px] font-mono text-[#adaaaa] py-0.5 align-top">{next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conceptual flow */}
      <div className="bg-[#111] border border-white/5 rounded-sm p-4">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#494847] block mb-4">
          Conceptual flow
        </span>
        <div className="flex items-start gap-0">
          {CONCEPTUAL_FLOW.map((step, i) => (
            <div key={step.id} className="flex items-center">
              {i > 0 && <div className="w-8 h-px bg-white/[0.06] shrink-0" />}
              <div className="flex flex-col items-center gap-1.5 px-3 py-2 border border-white/5 bg-[#0d0d0d] rounded-sm min-w-[80px]">
                <span className={`text-[9px] font-bold font-body uppercase tracking-widest ${step.color}`}>
                  {step.label}
                </span>
                <p className="text-[8px] font-body text-[#2e2e2e] text-center leading-relaxed max-w-[120px]">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Killer line */}
      <p className="text-[10px] font-body text-[#2e2e2e] italic text-center">
        HTTP/1.x can be implemented manually.&nbsp;&nbsp;
        HTTP/2 must be observed.&nbsp;&nbsp;
        <span className="text-cyan-400/50">HTTP/3 must be understood.</span>
      </p>

      {/* Lifecycle pills */}
      <LifecyclePills stageDefs={stageDefs} />
    </>
  );
}
