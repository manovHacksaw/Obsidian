"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

// ── Resources ────────────────────────────────────────────────────
// Six realistic page resources with varied durations.
// vendor.js is intentionally slow — it's the blocker in HTTP/1.1.

const RESOURCES = [
  { id: "vendor", name: "vendor.js",  durationMs: 3000, color: "#ef4444", kind: "script" },
  { id: "style",  name: "style.css",  durationMs:  600, color: "#3b82f6", kind: "style"  },
  { id: "hero",   name: "hero.jpg",   durationMs:  800, color: "#10b981", kind: "image"  },
  { id: "app",    name: "app.js",     durationMs: 1200, color: "#f59e0b", kind: "script" },
  { id: "thumb",  name: "thumb.jpg",  durationMs:  500, color: "#8b5cf6", kind: "image"  },
  { id: "api",    name: "api.json",   durationMs: 1000, color: "#06b6d4", kind: "data"   },
] as const;

type ResourceId = (typeof RESOURCES)[number]["id"];

// ── HTTP/1.1 layout (2 connections) ──────────────────────────────
// The browser opens 2 connections and queues requests sequentially.
// vendor.js blocks app.js and api.json on Connection 1.

const H1_CONNS: { label: string; items: ResourceId[] }[] = [
  { label: "Connection 1", items: ["vendor", "app", "api"] },
  { label: "Connection 2", items: ["style",  "hero", "thumb"] },
];

// Pre-compute start/end times for HTTP/1.1
function computeH1Bars(): Bar[] {
  const bars: Bar[] = [];
  for (const conn of H1_CONNS) {
    let cursor = 0;
    for (const rid of conn.items) {
      const r = RESOURCES.find((x) => x.id === rid)!;
      bars.push({
        resourceId: rid,
        connLabel:  conn.label,
        name:       r.name,
        color:      r.color,
        kind:       r.kind,
        startMs:    cursor,
        endMs:      cursor + r.durationMs,
        blocked:    cursor > 0,  // had to wait — the HOL victim
      });
      cursor += r.durationMs;
    }
  }
  return bars;
}

// HTTP/2 layout: all streams start at 0
function computeH2Bars(): Bar[] {
  return RESOURCES.map((r) => ({
    resourceId: r.id,
    connLabel:  "Stream",
    name:       r.name,
    color:      r.color,
    kind:       r.kind,
    startMs:    0,
    endMs:      r.durationMs,
    blocked:    false,
  }));
}

// ── Types ────────────────────────────────────────────────────────

interface Bar {
  resourceId: string;
  connLabel:  string;
  name:       string;
  color:      string;
  kind:       string;
  startMs:    number;
  endMs:      number;
  blocked:    boolean;
}

// ── Constants ────────────────────────────────────────────────────

const H1_BARS   = computeH1Bars();
const H2_BARS   = computeH2Bars();
const H1_TOTAL  = Math.max(...H1_BARS.map((b) => b.endMs));   // 5200ms
const H2_TOTAL  = Math.max(...H2_BARS.map((b) => b.endMs));   // 3000ms
const MAX_TOTAL = H1_TOTAL;                                    // shared timeline scale

// Animation runs at 1.5× real-time speed
const SPEED = 1.5;

// ── Gantt bar component ──────────────────────────────────────────

function GanttBar({
  bar,
  elapsedMs,
  totalMs,
  showBlocked,
}: {
  bar:         Bar;
  elapsedMs:   number;
  totalMs:     number;
  showBlocked: boolean;
}) {
  const startPct  = (bar.startMs  / totalMs) * 100;
  const widthPct  = (bar.endMs    / totalMs) * 100 - startPct;
  // How far has the "fill" progressed? 0→1
  const fillRatio = Math.min(1, Math.max(0, (elapsedMs - bar.startMs) / (bar.endMs - bar.startMs)));
  const isDone    = elapsedMs >= bar.endMs;
  const isActive  = elapsedMs >= bar.startMs && elapsedMs < bar.endMs;
  const isPending = elapsedMs < bar.startMs;

  const kindIcon: Record<string, string> = {
    script: "code",
    style:  "palette",
    image:  "image",
    data:   "data_object",
  };

  return (
    <div
      className="relative h-7 rounded-[2px] overflow-hidden"
      style={{ marginLeft: `${startPct}%`, width: `${widthPct}%` }}
    >
      {/* Background track */}
      <div
        className="absolute inset-0 rounded-[2px] opacity-10"
        style={{ backgroundColor: bar.color }}
      />

      {/* Fill (animated progress) */}
      {!isPending && (
        <div
          className="absolute inset-y-0 left-0 rounded-[2px] transition-none"
          style={{
            backgroundColor: bar.color,
            width: `${fillRatio * 100}%`,
            opacity: isDone ? 0.7 : 0.9,
          }}
        />
      )}

      {/* Pending / waiting overlay */}
      {isPending && showBlocked && bar.blocked && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[2px]"
          style={{ backgroundColor: `${bar.color}08` }}
        >
          <motion.span
            className="text-[8px] font-mono font-bold tracking-wider"
            style={{ color: bar.color + "60" }}
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          >
            QUEUED
          </motion.span>
        </div>
      )}

      {/* Label */}
      <div className="absolute inset-0 flex items-center px-1.5 gap-1 pointer-events-none">
        <span
          className="material-symbols-outlined shrink-0 leading-none"
          style={{ fontSize: "9px", color: isDone ? "#ffffff99" : "#ffffff66" }}
        >
          {kindIcon[bar.kind] ?? "circle"}
        </span>
        <span
          className="text-[9px] font-mono truncate leading-none"
          style={{ color: isDone ? "#ffffffcc" : isActive ? "#ffffffaa" : "#ffffff44" }}
        >
          {bar.name}
        </span>
        {isDone && (
          <span className="ml-auto text-[8px] font-mono text-white/30 shrink-0">
            {(bar.endMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}

// ── Single panel (H1 or H2) ──────────────────────────────────────

function Panel({
  title,
  subtitle,
  bars,
  totalMs,
  elapsedMs,
  done,
  isH1,
}: {
  title:     string;
  subtitle:  string;
  bars:      Bar[];
  totalMs:   number;
  elapsedMs: number;
  done:      boolean;
  isH1:      boolean;
}) {
  // Group bars by connLabel
  const groups: { label: string; bars: Bar[] }[] = [];
  for (const bar of bars) {
    const g = groups.find((g) => g.label === bar.connLabel);
    if (g) g.bars.push(bar);
    else groups.push({ label: bar.connLabel, bars: [bar] });
  }

  const completionMs = Math.max(...bars.map((b) => b.endMs));
  const cursorPct    = Math.min(100, (elapsedMs / MAX_TOTAL) * 100);

  // Find which bars are currently blocked (waiting behind a slow request)
  const showBlocked = elapsedMs > 0;

  return (
    <div className={`flex-1 flex flex-col min-w-0 border border-white/[0.06] rounded-sm overflow-hidden bg-[#0c0c0c]`}>
      {/* Panel header */}
      <div className={`px-4 py-3 border-b border-white/[0.06] ${isH1 ? "bg-red-500/[0.03]" : "bg-green-500/[0.03]"}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[9px] font-bold font-body uppercase tracking-[0.2em] ${isH1 ? "text-red-400/70" : "text-green-400/70"}`}>
            {isH1 ? "HTTP/1.1" : "HTTP/2"}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-[2px] font-mono ${isH1 ? "bg-red-500/10 text-red-400/60" : "bg-green-500/10 text-green-400/60"}`}>
            {subtitle}
          </span>
        </div>
        <h3 className="text-sm font-bold font-headline text-white">{title}</h3>
      </div>

      {/* Timeline area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">

        {/* Time ruler */}
        <div className="relative h-4">
          <div className="absolute inset-x-0 top-2 h-px bg-white/[0.06]" />
          {[0, 1, 2, 3, 4, 5].map((s) => {
            const pct = (s * 1000 / MAX_TOTAL) * 100;
            if (pct > 100) return null;
            return (
              <div key={s} className="absolute top-0 flex flex-col items-center" style={{ left: `${pct}%` }}>
                <span className="text-[8px] font-mono text-[#333] -translate-x-1/2">{s}s</span>
                <div className="w-px h-1.5 bg-white/[0.06] mt-0.5" />
              </div>
            );
          })}
          {/* Time cursor */}
          {elapsedMs > 0 && (
            <div
              className={`absolute top-0 w-px h-4 transition-none ${isH1 ? "bg-red-400/40" : "bg-green-400/40"}`}
              style={{ left: `${cursorPct}%` }}
            />
          )}
        </div>

        {/* Connection/stream rows */}
        {groups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <span className="text-[8px] font-mono text-[#333] uppercase tracking-[0.15em]">
              {isH1 ? group.label : `${group.bars.length} streams`}
            </span>
            <div className="relative">
              {/* Row background */}
              <div className="absolute inset-0 bg-white/[0.01] rounded-[2px]" />
              {/* Idle gap visualization for H1 — show wasted connection time */}
              {isH1 && (
                <div
                  className="absolute top-0 bottom-0 right-0 bg-red-500/[0.015] rounded-r-[2px]"
                  style={{
                    left: `${(Math.max(...group.bars.map((b) => b.endMs)) / MAX_TOTAL) * 100}%`,
                  }}
                />
              )}
              <div className="relative space-y-1 py-1">
                {group.bars.map((bar) => (
                  <GanttBar
                    key={bar.resourceId}
                    bar={bar}
                    elapsedMs={elapsedMs}
                    totalMs={MAX_TOTAL}
                    showBlocked={showBlocked}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Completion marker */}
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 px-3 py-2 rounded-[2px] border mt-2 ${
                isH1
                  ? "border-red-500/15 bg-red-500/[0.03]"
                  : "border-green-500/15 bg-green-500/[0.03]"
              }`}
            >
              <span
                className={`material-symbols-outlined text-sm ${isH1 ? "text-red-400/60" : "text-green-400/60"}`}
              >
                {isH1 ? "cancel" : "check_circle"}
              </span>
              <span className="text-[10px] font-mono font-bold text-white/70">
                All resources loaded in{" "}
                <span className={isH1 ? "text-red-400" : "text-green-400"}>
                  {(completionMs / 1000).toFixed(1)}s
                </span>
              </span>
              {isH1 && (
                <span className="ml-auto text-[9px] font-body text-[#494847]">
                  {((H1_TOTAL - H2_TOTAL) / 1000).toFixed(1)}s wasted on HOL blocking
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── HOL explanation callouts ─────────────────────────────────────

function HOLCallout({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      {[
        {
          icon: "block",
          color: "text-red-400/70",
          bg:   "bg-red-500/[0.04] border-red-500/10",
          title: "The Blocker",
          body:  "vendor.js takes 3.0s. In HTTP/1.1, Connection 1 is occupied for the entire duration — app.js and api.json must wait behind it even though the server is ready to send them.",
        },
        {
          icon: "hourglass_empty",
          color: "text-yellow-400/70",
          bg:   "bg-yellow-500/[0.04] border-yellow-500/10",
          title: "Head-of-Line Blocking",
          body:  "HTTP/1.1 processes one request per connection. A slow request at the head of the queue blocks every request behind it on that connection — like a supermarket checkout with one slow customer.",
        },
        {
          icon: "merge",
          color: "text-green-400/70",
          bg:   "bg-green-500/[0.04] border-green-500/10",
          title: "HTTP/2 Multiplexing",
          body:  "HTTP/2 sends all requests as independent streams over one TCP connection. vendor.js runs in parallel with everything else — total time equals the slowest single resource, not their sum.",
        },
      ].map((c) => (
        <div key={c.title} className={`px-3 py-2.5 rounded-sm border ${c.bg} space-y-1`}>
          <div className="flex items-center gap-1.5">
            <span className={`material-symbols-outlined ${c.color}`} style={{ fontSize: "13px" }}>{c.icon}</span>
            <span className={`text-[10px] font-bold font-body ${c.color}`}>{c.title}</span>
          </div>
          <p className="text-[9px] font-body text-[#494847] leading-relaxed">{c.body}</p>
        </div>
      ))}
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

type SimState = "idle" | "running" | "done";

export default function HOLPage() {
  const [simState,  setSimState]  = useState<SimState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const startTimeRef = useRef<number>(0);
  const rafRef       = useRef<number>(0);

  const h1Done = elapsedMs >= H1_TOTAL;
  const h2Done = elapsedMs >= H2_TOTAL;

  // ── Animation loop ──
  const tick = useCallback(() => {
    const now         = performance.now();
    const realElapsed = now - startTimeRef.current;
    const simElapsed  = realElapsed * SPEED;

    setElapsedMs(Math.min(simElapsed, H1_TOTAL + 200));

    if (simElapsed < H1_TOTAL + 200) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setSimState("done");
    }
  }, []);

  const run = useCallback(() => {
    if (simState === "running") return;
    setElapsedMs(0);
    setSimState("running");
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [simState, tick]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setSimState("idle");
    setElapsedMs(0);
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const isRunning = simState === "running";
  const isDone    = simState === "done";

  return (
    <div className="flex flex-col h-screen bg-[#0e0e0e] text-white overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-[#0a0a0a]">
        <Link
          href="/simulate"
          className="flex items-center gap-1.5 text-[#494847] hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_back</span>
          <span className="text-[10px] font-body">Modules</span>
        </Link>

        <div className="w-px h-4 bg-white/[0.06]" />

        <span className="material-symbols-outlined text-[#ff8f6f]" style={{ fontSize: "16px" }}>
          dns
        </span>
        <div>
          <span className="text-sm font-bold font-headline text-white">HOL Blocking</span>
          <span className="ml-2 text-[9px] font-body text-[#494847]">HTTP/1.1 vs HTTP/2 multiplexing</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {isDone && (
            <button
              onClick={reset}
              className="text-[10px] font-body text-[#494847] hover:text-[#adaaaa] transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>refresh</span>
              Reset
            </button>
          )}
          <button
            onClick={run}
            disabled={isRunning}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-sm font-bold font-body text-[10px] uppercase tracking-[0.15em] transition-all ${
              isRunning
                ? "bg-[#1a1919] text-[#333] cursor-not-allowed"
                : isDone
                  ? "bg-[#ff8f6f]/10 text-[#ff8f6f] hover:bg-[#ff8f6f]/20 border border-[#ff8f6f]/20"
                  : "bg-[#ff8f6f] text-[#5c1400] hover:bg-[#ff7851] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            }`}
          >
            {isRunning ? (
              <>
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-[#ff8f6f]"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                />
                Simulating…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>play_arrow</span>
                {isDone ? "Run Again" : "Run Simulation"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4">

        {/* Idle hero */}
        {simState === "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-12 text-center space-y-3"
          >
            <div className="w-16 h-16 bg-[#1a1919] border border-white/8 rounded-sm flex items-center justify-center">
              <span className="material-symbols-outlined text-[#ff8f6f]/50 text-3xl">dns</span>
            </div>
            <p className="text-sm font-headline font-bold text-[#494847]">
              6 resources. 2 connections. One slow file.
            </p>
            <p className="text-[10px] font-body text-[#3a3939] max-w-md leading-relaxed">
              Watch how a single slow request (<span className="font-mono text-[#494847]">vendor.js, 3s</span>) creates
              a queue behind it in HTTP/1.1, while HTTP/2 streams all resources concurrently.
            </p>
          </motion.div>
        )}

        {/* Panels */}
        {simState !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-4"
            style={{ minHeight: "260px" }}
          >
            <Panel
              title="Sequential per connection"
              subtitle="2 connections"
              bars={H1_BARS}
              totalMs={H1_TOTAL}
              elapsedMs={elapsedMs}
              done={h1Done}
              isH1
            />
            <Panel
              title="All streams in parallel"
              subtitle="1 connection, 6 streams"
              bars={H2_BARS}
              totalMs={H2_TOTAL}
              elapsedMs={elapsedMs}
              done={h2Done}
              isH1={false}
            />
          </motion.div>
        )}

        {/* Speed savings badge */}
        <AnimatePresence>
          {h1Done && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center"
            >
              <div className="flex items-center gap-4 px-6 py-3 rounded-sm border border-white/[0.06] bg-[#0c0c0c]">
                <div className="text-center">
                  <div className="text-2xl font-black font-headline text-red-400">
                    {(H1_TOTAL / 1000).toFixed(1)}s
                  </div>
                  <div className="text-[9px] font-body text-[#494847]">HTTP/1.1</div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="h-px w-12 bg-white/[0.06]" />
                  <span className="text-[9px] font-bold font-mono text-[#ff8f6f]">
                    {Math.round(((H1_TOTAL - H2_TOTAL) / H1_TOTAL) * 100)}% slower
                  </span>
                  <div className="h-px w-12 bg-white/[0.06]" />
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black font-headline text-green-400">
                    {(H2_TOTAL / 1000).toFixed(1)}s
                  </div>
                  <div className="text-[9px] font-body text-[#494847]">HTTP/2</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Explanations */}
        <HOLCallout visible={isDone} />

        {/* Resource legend */}
        {simState !== "idle" && (
          <div className="flex flex-wrap gap-3 px-1">
            {RESOURCES.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-[1px]" style={{ backgroundColor: r.color }} />
                <span className="text-[9px] font-mono text-[#494847]">{r.name}</span>
                <span className="text-[8px] font-mono text-[#333]">{(r.durationMs / 1000).toFixed(1)}s</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom explanation when idle */}
        {simState === "idle" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-2">
            {[
              {
                proto: "HTTP/1.1",
                color: "text-red-400/70 border-red-500/10",
                bg: "bg-red-500/[0.02]",
                points: [
                  "Browser opens ~6 TCP connections per host",
                  "Each connection handles ONE request at a time",
                  "Slow request at the head blocks the entire queue",
                  "Remaining requests wait even if server is ready",
                ],
              },
              {
                proto: "HTTP/2",
                color: "text-green-400/70 border-green-500/10",
                bg: "bg-green-500/[0.02]",
                points: [
                  "Single TCP connection, multiple logical streams",
                  "All requests fly in parallel — no queueing",
                  "Total time = slowest single resource",
                  "Also adds header compression and server push",
                ],
              },
            ].map((item) => (
              <div key={item.proto} className={`px-4 py-3 rounded-sm border ${item.color.split(" ")[1]} ${item.bg}`}>
                <div className={`text-[10px] font-bold font-body uppercase tracking-[0.2em] mb-2 ${item.color.split(" ")[0]}`}>
                  {item.proto}
                </div>
                <ul className="space-y-1">
                  {item.points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#333] mt-px">·</span>
                      <span className="text-[9px] font-body text-[#494847] leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
