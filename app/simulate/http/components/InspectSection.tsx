"use client";

import React from "react";

function deriveGradientColor(borderColor: string): string {
  const parts = borderColor.split(/\s+/).filter(Boolean);
  const borderToken = parts.find((token) => /^border(?:-[lrtbxy])?-/.test(token));
  if (!borderToken) return "from-white/20";

  const m = borderToken.match(/^border(?:-[lrtbxy])?-(.+?)(?:\/(\d+))?$/);
  if (!m) return "from-white/20";

  const color = m[1];
  const opacity = m[2] ? Math.min(100, Math.max(0, Number(m[2]) + 10)) : 30;
  return `from-${color}/${opacity}`;
}

export function InspectSection({
  step, label, icon, duration, color, borderColor, gradientColor, children,
}: {
  step: string; label: string; icon: string;
  duration: number; color: string; borderColor: string;
  gradientColor?: string;
  children: React.ReactNode;
}) {
  const fromClass = gradientColor ?? deriveGradientColor(borderColor);

  return (
    <div className="relative pl-14 pb-10">
      {/* Vertical timeline line */}
      <div className={`absolute left-[17px] top-9 bottom-0 w-px bg-gradient-to-b ${fromClass} to-transparent`} />

      {/* Icon box — absolutely positioned, perfectly centered on the line */}
      <div className={`absolute left-0 top-0 w-9 h-9 rounded-sm bg-[#111] border ${borderColor} flex items-center justify-center`}>
        <span className={`material-symbols-outlined ${color}`} style={{ fontSize: "18px", lineHeight: 1 }}>{icon}</span>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div className="pt-0.5">
          <span className="text-[9px] font-body text-[#494847] uppercase tracking-widest">{step}</span>
          <div className={`text-sm font-bold font-body leading-tight ${color}`}>{label}</div>
        </div>
        <span className={`text-xs font-bold font-mono tabular-nums mt-1 ${color}`}>{duration}ms</span>
      </div>
      {children}
    </div>
  );
}

export function InspectRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 font-mono text-[10px] leading-relaxed py-0.5">
      <span className="text-[#494847] w-28 shrink-0">{k}</span>
      <span className={`break-all ${accent ? "text-[#ff8f6f] font-semibold" : "text-[#777575]"}`}>{v}</span>
    </div>
  );
}
