"use client";

import { motion } from "framer-motion";
import type { LifecycleStep } from "../types";

// ── Step pill ────────────────────────────────────────────────────

function StepPill({ step }: { step: LifecycleStep }) {
  const isPending  = step.status === "pending";
  const isActive   = step.status === "active";
  const isDone     = step.status === "done";
  const isError    = step.status === "error";

  const pillClass = isPending
    ? "bg-[#1a1919] text-[#2e2e2e]"
    : isActive
      ? "bg-blue-500/10 text-blue-400"
      : isDone
        ? "bg-green-500/10 text-green-400"
        : "bg-red-500/10 text-red-400";

  const durationLabel = step.durationMs !== undefined && step.durationMs > 0
    ? ` ${step.durationMs}ms`
    : "";

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-[2px] text-[9px] font-mono transition-all duration-200 shrink-0 ${pillClass}`}>
      {isActive && (
        <motion.span
          className="w-1 h-1 rounded-full bg-blue-400 shrink-0"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
      )}
      {isDone && (
        <span className="material-symbols-outlined text-green-400 shrink-0" style={{ fontSize: "9px", lineHeight: 1 }}>
          check
        </span>
      )}
      {isError && (
        <span className="material-symbols-outlined text-red-400 shrink-0" style={{ fontSize: "9px", lineHeight: 1 }}>
          close
        </span>
      )}
      <span>
        {step.label}
        {durationLabel && (
          <span className={isDone ? "text-green-400/50" : "text-[#3a3939]"}>{durationLabel}</span>
        )}
      </span>
    </div>
  );
}

// ── Arrow connector ───────────────────────────────────────────────

function Arrow({ lit }: { lit: boolean }) {
  return (
    <span className={`text-[10px] font-mono shrink-0 transition-colors duration-200 ${lit ? "text-[#3a3939]" : "text-[#1e1e1e]"}`}>
      →
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────

export function LifecycleTimeline({ steps }: { steps: LifecycleStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        // Arrow is lit when the next step has started
        const nextActive = !isLast && (steps[i + 1].status === "active" || steps[i + 1].status === "done");
        return (
          <div key={step.id} className="flex items-center gap-1">
            <StepPill step={step} />
            {!isLast && <Arrow lit={nextActive || step.status === "done"} />}
          </div>
        );
      })}
    </div>
  );
}
