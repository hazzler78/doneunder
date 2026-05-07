import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-cyan-800/80 bg-cyan-950/60 px-2.5 py-0.5 text-xs font-semibold text-cyan-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
