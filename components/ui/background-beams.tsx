"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none",
        className
      )}
    >
      <svg
        className="absolute w-full h-full opacity-30"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient
            id="beam-center"
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop offset="0%" stopColor="#ff8f6f" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ff8f6f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="beam1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff7851" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ff7851" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff8f6f" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ff8f6f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Center glow */}
        <ellipse cx="600" cy="400" rx="400" ry="300" fill="url(#beam-center)" />
        {/* Beam lines */}
        <line x1="600" y1="0" x2="200" y2="800" stroke="url(#beam1)" strokeWidth="1" />
        <line x1="600" y1="0" x2="400" y2="800" stroke="url(#beam1)" strokeWidth="0.5" />
        <line x1="600" y1="0" x2="600" y2="800" stroke="url(#beam2)" strokeWidth="1" />
        <line x1="600" y1="0" x2="800" y2="800" stroke="url(#beam1)" strokeWidth="0.5" />
        <line x1="600" y1="0" x2="1000" y2="800" stroke="url(#beam1)" strokeWidth="1" />
        <line x1="0" y1="400" x2="1200" y2="200" stroke="url(#beam2)" strokeWidth="0.5" />
        <line x1="0" y1="200" x2="1200" y2="600" stroke="url(#beam2)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
