import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function BentoGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-fr",
        className
      )}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  className,
  title,
  description,
  icon,
  children,
}: {
  className?: string;
  title?: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-sm",
        "bg-[#1a1919] hover:bg-[#201f1f]",
        "transition-colors duration-300",
        "p-8",
        className
      )}
    >
      {icon && (
        <div className="mb-6 w-12 h-12 flex items-center justify-center bg-[#201f1f] rounded-sm">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="text-xl font-bold font-headline text-white mb-3">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-sm text-[#adaaaa] leading-relaxed">{description}</p>
      )}
      {children}
    </div>
  );
}
