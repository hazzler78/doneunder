"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AmbassadorSwipeContext } from "@/lib/public-ambassadors";
import { cn } from "@/lib/utils";

type Props = {
  swipe: AmbassadorSwipeContext;
  children: ReactNode;
};

const SWIPE_THRESHOLD_PX = 72;
const MAX_DRAG_HINT_PX = 56;

export function AmbassadorProfileSwipe({ swipe, children }: Props) {
  const router = useRouter();
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef<"h" | "v" | null>(null);
  const [dragX, setDragX] = useState(0);
  const [navigating, setNavigating] = useState(false);

  const goTo = useCallback(
    (username: string | undefined | null) => {
      if (!username || navigating) return;
      setNavigating(true);
      router.push(`/${username}`);
    },
    [navigating, router],
  );

  function resetDrag() {
    startRef.current = null;
    lockedRef.current = null;
    setDragX(0);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (navigating || (event.pointerType === "mouse" && event.button !== 0)) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("a,button,input,textarea,select,[role='button']")) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    lockedRef.current = null;
    setDragX(0);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!startRef.current || navigating) return;
    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;

    if (!lockedRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      lockedRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (lockedRef.current === "v") {
        startRef.current = null;
        setDragX(0);
        return;
      }
    }

    if (lockedRef.current !== "h") return;
    const capped = Math.max(-MAX_DRAG_HINT_PX, Math.min(MAX_DRAG_HINT_PX, dx * 0.35));
    setDragX(capped);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const dx = event.clientX - startRef.current.x;
    const wasHorizontal = lockedRef.current === "h";
    resetDrag();
    if (!wasHorizontal || navigating) return;

    if (dx <= -SWIPE_THRESHOLD_PX && swipe.next) {
      goTo(swipe.next.username);
      return;
    }
    if (dx >= SWIPE_THRESHOLD_PX && swipe.previous) {
      goTo(swipe.previous.username);
    }
  }

  const hint =
    swipe.previous && swipe.next
      ? "Swipe for more ambassadors"
      : swipe.next
        ? "Swipe left for the next ambassador"
        : "Swipe right for the previous ambassador";

  return (
    <div className="relative">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 section-pad pb-0 pt-4">
        {swipe.previous ? (
          <Link
            href={`/${swipe.previous.username}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-heading-muted transition hover:text-primary"
            aria-label={`Previous: ${swipe.previous.fullName}`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="max-w-[9rem] truncate">{swipe.previous.fullName.split(" ")[0]}</span>
          </Link>
        ) : (
          <span className="w-16" aria-hidden />
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          {swipe.index + 1} of {swipe.total}
        </p>
        {swipe.next ? (
          <Link
            href={`/${swipe.next.username}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-heading-muted transition hover:text-primary"
            aria-label={`Next: ${swipe.next.fullName}`}
          >
            <span className="max-w-[9rem] truncate text-right">
              {swipe.next.fullName.split(" ")[0]}
            </span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span className="w-16" aria-hidden />
        )}
      </div>

      <p className="mx-auto max-w-lg px-4 pt-2 text-center text-[11px] text-muted-foreground sm:hidden">
        {hint}
      </p>

      <div
        className={cn(
          "touch-pan-y transition-opacity",
          navigating && "pointer-events-none opacity-70",
        )}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragX ? "none" : "transform 180ms ease-out",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={resetDrag}
        onPointerLeave={(event) => {
          if (event.buttons === 0) resetDrag();
        }}
      >
        {children}
      </div>
    </div>
  );
}
