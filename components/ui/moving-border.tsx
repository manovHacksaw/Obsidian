"use client";

import React, { useRef } from "react";
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

export function MovingBorderButton({
  children,
  duration = 2000,
  className,
  containerClassName,
  ...props
}: {
  children: React.ReactNode;
  duration?: number;
  className?: string;
  containerClassName?: string;
  [key: string]: unknown;
}) {
  return (
    <button
      className={cn(
        "relative inline-flex h-12 overflow-hidden rounded-sm p-px cursor-pointer",
        containerClassName
      )}
      {...props}
    >
      <MovingBorderSVG duration={duration} rx="0" ry="0" />
      <span
        className={cn(
          "relative flex h-full w-full items-center justify-center",
          "bg-[#1a1919] px-6 text-sm font-bold font-body text-white",
          "antialiased transition-colors hover:bg-[#201f1f]",
          className
        )}
      >
        {children}
      </span>
    </button>
  );
}

function MovingBorderSVG({
  duration,
  rx,
  ry,
}: {
  duration: number;
  rx: string;
  ry: string;
}) {
  const pathRef = useRef<SVGRectElement | null>(null);
  const progress = useMotionValue<number>(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val)?.x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val)?.y ?? 0);

  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
      >
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx={rx}
          ry={ry}
          ref={pathRef}
        />
      </svg>
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "inline-block",
          transform,
        }}
      >
        <div
          style={{
            width: "4rem",
            height: "4rem",
            borderRadius: "100%",
            background:
              "radial-gradient(circle at center, #ff8f6f 0%, rgba(255,143,111,0.3) 40%, transparent 70%)",
            filter: "blur(4px)",
          }}
        />
      </motion.div>
    </>
  );
}
