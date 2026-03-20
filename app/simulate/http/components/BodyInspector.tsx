"use client";

import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { JsonTree } from "./JsonTree";

// ── JSON tokenizer ──────────────────────────────────────────────────────────

type TokType = "key" | "string" | "number" | "boolean" | "null" | "punctuation" | "whitespace";

interface Token { type: TokType; value: string }

// Regex groups (in order of priority):
// 1. key string   – "..." followed by optional whitespace then ":"
// 2. value string – "..."
// 3. number
// 4. keyword      – true / false / null
// 5. punctuation  – { } [ ] , :
// 6. whitespace
const JSON_RE = /("(?:[^"\\]|\\.)*"(?=[ \t]*:))|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false|null)\b|([{}[\],:])|(\s+)/g;

function tokenizeJson(src: string): Token[] {
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  JSON_RE.lastIndex = 0;
  while ((m = JSON_RE.exec(src)) !== null) {
    if (m[1])      tokens.push({ type: "key",         value: m[1] });
    else if (m[2]) tokens.push({ type: "string",      value: m[2] });
    else if (m[3]) tokens.push({ type: "number",      value: m[3] });
    else if (m[4]) tokens.push({ type: m[4] === "null" ? "null" : "boolean", value: m[4] });
    else if (m[5]) tokens.push({ type: "punctuation", value: m[5] });
    else if (m[6]) tokens.push({ type: "whitespace",  value: m[6] });
  }
  return tokens;
}

const TOK_COLOR: Record<TokType, string> = {
  key:         "text-[#ff8f6f]/90",
  string:      "text-emerald-400/80",
  number:      "text-amber-300/90",
  boolean:     "text-sky-400/90",
  null:        "text-sky-400/70",
  punctuation: "text-[#555]",
  whitespace:  "",
};

// ── Pretty viewer with optional search highlight ────────────────────────────

function JsonHighlight({ code, search }: { code: string; search: string }) {
  const tokens = useMemo(() => tokenizeJson(code), [code]);
  const q = search.trim().toLowerCase();

  if (!q) {
    return (
      <pre className="text-[11px] font-mono leading-[1.65] whitespace-pre select-text">
        {tokens.map((tok, i) => (
          <span key={i} className={TOK_COLOR[tok.type]}>{tok.value}</span>
        ))}
      </pre>
    );
  }

  // With search: render tokens, highlighting any that contain the query
  return (
    <pre className="text-[11px] font-mono leading-[1.65] whitespace-pre select-text">
      {tokens.map((tok, i) => {
        if (tok.type === "whitespace") return tok.value;
        const lo = tok.value.toLowerCase();
        const idx = lo.indexOf(q);
        if (idx === -1) return <span key={i} className={TOK_COLOR[tok.type]}>{tok.value}</span>;
        // split around match
        const before = tok.value.slice(0, idx);
        const match  = tok.value.slice(idx, idx + q.length);
        const after  = tok.value.slice(idx + q.length);
        return (
          <span key={i} className={TOK_COLOR[tok.type]}>
            {before}
            <mark className="bg-yellow-400/25 text-yellow-200 rounded-[2px] not-italic">{match}</mark>
            {after}
          </span>
        );
      })}
    </pre>
  );
}

// ── Raw viewer with search highlight ───────────────────────────────────────

function RawHighlight({ code, search }: { code: string; search: string }) {
  const q = search.trim();
  if (!q) {
    return (
      <pre className="text-[11px] font-mono leading-[1.65] text-[#adaaaa] whitespace-pre select-text">{code}</pre>
    );
  }
  const parts = code.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <pre className="text-[11px] font-mono leading-[1.65] text-[#adaaaa] whitespace-pre select-text">
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="bg-yellow-400/25 text-yellow-200 rounded-[2px] not-italic">{p}</mark>
          : p
      )}
    </pre>
  );
}

// ── Tab button ──────────────────────────────────────────────────────────────

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-[9px] font-bold font-body uppercase tracking-widest transition-colors border-b-2 shrink-0 ${
        active
          ? "text-[#ff8f6f] border-[#ff8f6f]"
          : "text-[#494847] border-transparent hover:text-[#adaaaa]"
      }`}
    >
      {label}
    </button>
  );
}

// ── BodyInspector ───────────────────────────────────────────────────────────

type InspectTab = "pretty" | "raw" | "tree";

interface BodyInspectorProps {
  body: string;
  status: number;
  totalTime: number;
  downloadBytes?: number;
  onClose: () => void;
}

export function BodyInspector({
  body,
  totalTime,
  downloadBytes,
  onClose,
}: BodyInspectorProps) {
  const [tab, setTab]           = useState<InspectTab>("pretty");
  const [search, setSearch]     = useState("");
  const [copied, setCopied]     = useState(false);
  const [treeKey, setTreeKey]   = useState(0);
  const [treeOpen, setTreeOpen] = useState(true); // controls expand-all / collapse-all

  // Parse JSON
  const { isJson, parsed, formatted } = useMemo(() => {
    try {
      const p = JSON.parse(body);
      return { isJson: true, parsed: p, formatted: JSON.stringify(p, null, 2) };
    } catch {
      return { isJson: false, parsed: null, formatted: body };
    }
  }, [body]);

  const displayedText = isJson ? formatted : body;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayedText]);

  const expandAll = useCallback(() => {
    setTreeOpen(true);
    setTreeKey(k => k + 1);
  }, []);

  const collapseAll = useCallback(() => {
    setTreeOpen(false);
    setTreeKey(k => k + 1);
  }, []);

  const byteCount = downloadBytes ?? new Blob([body]).size;

  const tabs: { id: InspectTab; label: string; show: boolean }[] = [
    { id: "pretty", label: "Pretty",  show: isJson },
    { id: "raw",    label: "Raw",     show: true   },
    { id: "tree",   label: "Tree",    show: isJson },
  ];

  // If pretty isn't available (non-JSON) and current tab is pretty, show raw
  const activeTab = (!isJson && tab === "pretty") || (!isJson && tab === "tree") ? "raw" : tab;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.99 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col h-full min-h-0 overflow-hidden bg-[#0b0b0b] rounded-sm"
      style={{
        border: "1px solid rgba(255,143,111,0.14)",
        boxShadow: "0 0 0 1px rgba(255,143,111,0.04), inset 0 1px 0 rgba(255,255,255,0.02)",
      }}
    >
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0e0e0e] border-b border-white/5">

        {/* Title row */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <span
            className="material-symbols-outlined text-[#ff8f6f]"
            style={{ fontSize: "14px", lineHeight: 1 }}
          >
            code_blocks
          </span>
          <span className="text-[10px] font-bold font-body uppercase tracking-widest text-white/80">
            Body Inspector
          </span>
          <div className="flex-1" />
          {/* Tree controls */}
          <AnimatePresence>
            {activeTab === "tree" && isJson && (
              <motion.div
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 mr-2"
              >
                <button
                  onClick={expandAll}
                  className="text-[8px] font-bold font-body uppercase tracking-widest text-[#494847] hover:text-[#adaaaa] transition-colors"
                >
                  Expand all
                </button>
                <span className="text-[#262626] text-[8px]">·</span>
                <button
                  onClick={collapseAll}
                  className="text-[8px] font-bold font-body uppercase tracking-widest text-[#494847] hover:text-[#adaaaa] transition-colors"
                >
                  Collapse all
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-[#494847] hover:text-[#adaaaa] transition-colors"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "14px", lineHeight: 1 }}
            >
              close
            </span>
          </button>
        </div>

        {/* Tabs + search row */}
        <div className="flex items-stretch border-t border-white/[0.04]">
          {tabs.filter(t => t.show).map(t => (
            <Tab
              key={t.id}
              label={t.label}
              active={activeTab === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
          {/* Search */}
          <div className="flex-1 flex items-center justify-end px-2 gap-1.5">
            <span
              className="material-symbols-outlined text-[#3a3939]"
              style={{ fontSize: "12px", lineHeight: 1 }}
            >
              search
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search..."
              spellCheck={false}
              className="bg-transparent text-[10px] font-mono text-[#adaaaa] focus:outline-none placeholder:text-[#2e2e2e] w-24"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-[#3a3939] hover:text-[#adaaaa] transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "10px", lineHeight: 1 }}>close</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        <AnimatePresence mode="wait">
          {activeTab === "pretty" && isJson && (
            <motion.div
              key="pretty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <JsonHighlight code={formatted} search={search} />
            </motion.div>
          )}

          {activeTab === "raw" && (
            <motion.div
              key="raw"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <RawHighlight code={body} search={search} />
            </motion.div>
          )}

          {activeTab === "tree" && isJson && parsed !== null && (
            <motion.div
              key={`tree-${treeKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            >
              <JsonTree data={parsed} defaultOpen={treeOpen} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 py-2 border-t border-white/5 bg-[#0e0e0e] flex items-center gap-3">
        <span className="text-[9px] font-mono text-[#3a3939]">
          {byteCount.toLocaleString()} bytes
        </span>
        <span className="text-[#262626] text-[9px]">·</span>
        <span className="text-[9px] font-mono text-[#3a3939]">{totalTime}ms</span>
        {isJson && (
          <>
            <span className="text-[#262626] text-[9px]">·</span>
            <span className="text-[9px] font-body text-[#3a3939] uppercase tracking-widest">json</span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 text-[9px] font-body transition-colors ${
            copied ? "text-green-400" : "text-[#494847] hover:text-[#adaaaa]"
          }`}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "12px", lineHeight: 1 }}
          >
            {copied ? "check" : "content_copy"}
          </span>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </motion.div>
  );
}
