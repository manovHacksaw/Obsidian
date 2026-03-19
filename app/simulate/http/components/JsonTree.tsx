"use client";

import React, { useState } from "react";

type JVal = string | number | boolean | null | JVal[] | { [k: string]: JVal };

// ── Primitive leaf ──────────────────────────────────────────────────────────

function Primitive({ v }: { v: string | number | boolean | null }) {
  if (v === null)            return <span className="text-sky-400/90">null</span>;
  if (typeof v === "boolean") return <span className="text-sky-400/90">{String(v)}</span>;
  if (typeof v === "number")  return <span className="text-amber-300/90">{v}</span>;
  return <span className="text-emerald-400/80">{JSON.stringify(v)}</span>;
}

// ── Single tree node ────────────────────────────────────────────────────────

interface NodeProps {
  name: string | null;  // null → array element (show index from parent)
  value: JVal;
  depth: number;
  isLast: boolean;
  defaultOpen: boolean;
}

export function JsonTreeNode({ name, value, depth, isLast, defaultOpen }: NodeProps) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);

  const isObj  = typeof value === "object" && value !== null;
  const isArr  = Array.isArray(value);
  const entries: [string, JVal][] = isObj
    ? isArr
      ? (value as JVal[]).map((v, i) => [String(i), v])
      : Object.entries(value as Record<string, JVal>)
    : [];
  const count  = entries.length;
  const comma  = isLast ? "" : ",";
  const openB  = isArr ? "[" : "{";
  const closeB = isArr ? "]" : "}";

  // key label
  const keyEl = name !== null
    ? <><span className="text-[#ff8f6f]/90">{JSON.stringify(name)}</span><span className="text-[#3a3939]">: </span></>
    : null;

  // ── leaf
  if (!isObj) {
    return (
      <div className="font-mono text-[11px] leading-[1.65] select-text" style={{ paddingLeft: depth * 16 }}>
        {keyEl}<Primitive v={value as string | number | boolean | null} /><span className="text-[#3a3939]">{comma}</span>
      </div>
    );
  }

  // ── empty collection
  if (count === 0) {
    return (
      <div className="font-mono text-[11px] leading-[1.65]" style={{ paddingLeft: depth * 16 }}>
        {keyEl}<span className="text-[#555]">{openB}{closeB}</span><span className="text-[#3a3939]">{comma}</span>
      </div>
    );
  }

  // ── expandable collection
  return (
    <div>
      <div
        className="font-mono text-[11px] leading-[1.65] flex items-baseline gap-0.5 cursor-pointer group select-none"
        style={{ paddingLeft: Math.max(0, depth * 16 - 12) }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-3 shrink-0 text-[9px] text-[#494847] group-hover:text-[#adaaaa] transition-colors">
          {open ? "▾" : "▸"}
        </span>
        {keyEl}
        <span className="text-[#555]">{openB}</span>
        {!open && (
          <span className="text-[#3a3939] italic ml-1">
            {count} {isArr ? (count === 1 ? "item" : "items") : (count === 1 ? "key" : "keys")}
          </span>
        )}
        {!open && <span className="text-[#555] ml-0.5">{closeB}</span>}
        {!open && <span className="text-[#3a3939]">{comma}</span>}
      </div>

      {open && (
        <>
          {entries.map(([k, v], i) => (
            <JsonTreeNode
              key={k}
              name={isArr ? null : k}
              value={v as JVal}
              depth={depth + 1}
              isLast={i === count - 1}
              defaultOpen={defaultOpen}
            />
          ))}
          <div className="font-mono text-[11px] leading-[1.65]" style={{ paddingLeft: depth * 16 }}>
            <span className="text-[#555]">{closeB}</span>
            <span className="text-[#3a3939]">{comma}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Root export ─────────────────────────────────────────────────────────────

export function JsonTree({ data, defaultOpen }: { data: JVal; defaultOpen: boolean }) {
  return (
    <JsonTreeNode
      name={null}
      value={data}
      depth={0}
      isLast={true}
      defaultOpen={defaultOpen}
    />
  );
}
