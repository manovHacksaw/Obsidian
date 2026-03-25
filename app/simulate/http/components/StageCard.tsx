"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppMode, StageId, StageResult } from "../types";
import {
  STAGE_TEXT_COLORS,
  STAGE_BORDER_COLORS,
  STAGE_BG_ACTIVE,
  STAGE_ICON,
} from "../constants";

interface RealRow { key: string; value: string; accent?: boolean; badge?: "cache-hit" }

interface StageCardProps {
  def: { id: StageId; label: string; realLabel?: string; desc: string; realDesc: string; direction: "→" | "←" | "⚙" };
  index: number;
  currentIdx: number;
  result: StageResult | undefined;
  appMode: AppMode;
  realUrl: string;
  stageData: Record<string, Record<string, unknown>>;
  simError: string | null;
}

export function StageCard({
  def,
  index,
  currentIdx,
  result,
  appMode,
  realUrl,
  stageData,
  simError,
}: StageCardProps) {
  const isActive = currentIdx === index;
  const done    = result?.status === "done";
  const err     = result?.status === "error";
  const skipped = result?.status === "skipped";
  const pending = !result && !isActive;

  // Real-mode detail rows — built from stageData as SSE events arrive
  const sd = stageData[def.id];
  const dnsSD = stageData["dns"] as { ip?: string; hostname?: string } | undefined;
  const realRows: RealRow[] = [];
  if (done && appMode === "real" && sd) {
    if (def.id === "dns") {
      const d = sd as { ip: string; hostname: string; cached?: boolean };
      realRows.push({ key: "hostname", value: d.hostname });
      realRows.push({ key: "resolved", value: d.ip, accent: true });
      if (d.cached) {
        realRows.push({ key: "source", value: "OS cache — no DNS query issued", badge: "cache-hit" });
      }
    } else if (def.id === "tcp") {
      const port = (() => { try { const u = new URL(realUrl); return u.port || (realUrl.startsWith("https") ? "443" : "80"); } catch { return "?"; } })();
      realRows.push({ key: "target", value: `${dnsSD?.ip ?? ""}:${port}`, accent: true });
      realRows.push({ key: "rtt", value: `${result?.duration ?? 0}ms` });
    } else if (def.id === "tls") {
      const d = sd as { version: string; cipher: string; cert: { issuer: string; subject: string; validTo: string } };
      realRows.push({ key: "protocol", value: d.version, accent: true });
      realRows.push({ key: "cipher", value: d.cipher });
      realRows.push({ key: "issued by", value: d.cert.issuer });
      realRows.push({ key: "valid until", value: d.cert.validTo });
      realRows.push({ key: "validation", value: "disabled — self-signed certs accepted (rejectUnauthorized: false)" });
    } else if (def.id === "request") {
      const d = sd as { raw: string };
      const firstLine = d.raw.split("\r\n")[0] ?? "";
      const byteLen = new TextEncoder().encode(d.raw).length;
      realRows.push({ key: "line", value: firstLine, accent: true });
      realRows.push({ key: "size", value: `${byteLen} bytes` });
      realRows.push({ key: "timing", value: "OS buffer write — network transit is inside TTFB" });
    } else if (def.id === "processing") {
      realRows.push({ key: "ttfb", value: `${result?.duration ?? 0}ms`, accent: true });
      realRows.push({ key: "includes", value: "request transit + server work + first byte transit" });
    } else if (def.id === "response") {
      const d = sd as { status: number; statusText: string; headers: Record<string, string>; bytes: number };
      realRows.push({ key: "status", value: `${d.status} ${d.statusText}`, accent: true });
      realRows.push({ key: "size", value: `${d.bytes.toLocaleString()} bytes` });
      const ct = d.headers["content-type"];
      if (ct) realRows.push({ key: "type", value: ct.split(";")[0] });
    }
  }

  const stageTextColor = STAGE_TEXT_COLORS[def.id];
  const stageBorderL   = STAGE_BORDER_COLORS[def.id];
  const stageBgActive  = STAGE_BG_ACTIVE[def.id];
  const stageIcon      = STAGE_ICON[def.id];

  return (
    <motion.div
      key={def.id}
      animate={{ opacity: pending ? 0.3 : skipped ? 0.15 : 1 }}
      transition={{ duration: 0.2 }}
      className={`relative flex items-start gap-4 p-4 rounded-sm border-l-2 transition-all duration-200 ${
        isActive  ? `border border-white/8 ${stageBorderL} ${stageBgActive}` :
        done      ? `${stageBorderL} bg-[#111] border border-transparent hover:border-white/5` :
        err       ? "border-l-red-500/60 bg-red-500/5 border border-red-500/10" :
        skipped   ? "border-l-white/5 bg-transparent border border-transparent" :
        "border-l-white/5 bg-transparent border border-transparent"
      }`}
    >
      {/* Stage icon */}
      <div className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 border ${
        isActive ? `bg-[#1a1919] border-white/10` :
        done     ? `bg-[#0e0e0e] border-white/5` :
        err      ? `bg-red-500/10 border-red-500/20` :
        `bg-[#0e0e0e] border-white/5`
      }`}>
        {done && <span className={`material-symbols-outlined text-sm ${stageTextColor}`} style={{ fontSize: "16px", lineHeight: 1 }}>{stageIcon}</span>}
        {err  && <span className="material-symbols-outlined text-red-400" style={{ fontSize: "16px", lineHeight: 1 }}>error</span>}
        {skipped && <span className="material-symbols-outlined text-[#494847]" style={{ fontSize: "16px", lineHeight: 1 }}>remove</span>}
        {isActive && (
          <motion.span
            className={`material-symbols-outlined text-sm ${stageTextColor}`}
            style={{ fontSize: "16px", lineHeight: 1 }}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          >{stageIcon}</motion.span>
        )}
        {pending && <span className="material-symbols-outlined text-[#262626]" style={{ fontSize: "16px", lineHeight: 1 }}>{stageIcon}</span>}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold font-body ${
              isActive ? "text-white" :
              done     ? stageTextColor :
              err      ? "text-red-400" :
              skipped  ? "text-[#262626]" : "text-[#3a3939]"
            }`}>
              {appMode === "real" && def.realLabel ? def.realLabel : def.label}
            </span>
            {skipped && <span className="text-[9px] font-body text-[#262626]">— HTTP only</span>}
          </div>
          {(done || err) && result && (
            <span className={`text-xs font-bold font-mono tabular-nums shrink-0 ${err ? "text-red-400" : stageTextColor}`}>
              {err ? "FAILED" : `${result.duration}ms`}
            </span>
          )}
          {isActive && (
            <motion.span
              className={`text-xs font-mono tabular-nums shrink-0 ${stageTextColor}`}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >—</motion.span>
          )}
        </div>

        {/* Description */}
        <p className="text-[10px] font-body text-[#494847] mt-0.5">
          {appMode === "real" ? def.realDesc : def.desc}
        </p>

        {/* Real-mode key-value detail panel — appears as each stage resolves */}
        <AnimatePresence>
          {realRows.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 overflow-hidden"
            >
              <div className="border-l-2 border-[#262626] pl-3 space-y-1">
                {realRows.map(({ key, value, accent, badge }) => (
                  <div key={key} className="flex items-baseline gap-2 font-mono text-[10px] leading-relaxed">
                    <span className="text-[#494847] w-20 shrink-0 tabular-nums">{key}</span>
                    {badge === "cache-hit" ? (
                      <span className="text-[9px] font-bold font-body px-1.5 py-0.5 rounded-sm bg-blue-500/15 text-blue-400 shrink-0">
                        Cache hit
                      </span>
                    ) : (
                      <span className={`truncate ${accent ? "text-[#ff8f6f] font-semibold" : "text-[#777575]"}`}>
                        {value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isActive && (
          <motion.div
            className="mt-2 h-px bg-[#ff8f6f] origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.3, ease: "linear" }}
          />
        )}
        {err && simError && (
          <p className="text-[10px] font-body text-[#777575] mt-1 leading-relaxed">{simError}</p>
        )}
      </div>
    </motion.div>
  );
}
