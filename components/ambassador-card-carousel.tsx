"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { avatarFramingStyle, avatarImageSrc, readAvatarFraming } from "@/lib/avatar-focal";
import type { PublicAmbassadorCard } from "@/lib/public-ambassadors";
import { cn } from "@/lib/utils";

type Props = {
  cards: PublicAmbassadorCard[];
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "DU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function AmbassadorCard({ diver }: { diver: PublicAmbassadorCard }) {
  const photoSrc = avatarImageSrc(diver.avatarUrl);
  const frameStyle = avatarFramingStyle(readAvatarFraming(diver.avatarUrl));
  const available = diver.availabilityStatus === "available";

  return (
    <Link
      href={`/${diver.username}`}
      className="group flex h-full flex-col rounded-xl border border-border/60 bg-card/80 p-5 transition hover:border-primary/35 hover:bg-accent"
    >
      <div className="flex items-start gap-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border/80 bg-surface-muted">
          {photoSrc ? (
            <Image
              src={photoSrc}
              alt=""
              fill
              className="object-cover"
              style={frameStyle}
              sizes="56px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-heading/80">
              {initialsFromName(diver.fullName)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-lg font-semibold text-heading group-hover:text-foreground">
              {diver.fullName}
            </p>
            <span className="shrink-0 rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
              Live
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{diver.headline}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {diver.location ? <span>{diver.location}</span> : null}
        {diver.location && diver.availabilityStatus ? <span className="text-border">·</span> : null}
        {diver.availabilityStatus ? (
          <span className={cn(!available && "text-heading-muted")}>
            {available ? "Available" : "Deployed"}
          </span>
        ) : null}
        {diver.mobilizationNotice ? (
          <>
            <span className="text-border">·</span>
            <span>{diver.mobilizationNotice}</span>
          </>
        ) : null}
      </div>
      <p className="mt-4 text-xs font-medium text-primary/90 group-hover:text-primary">
        View ambassador page →
      </p>
    </Link>
  );
}

export function AmbassadorCardCarousel({ cards }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const canSwipe = cards.length > 1;

  const syncIndexFromScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root || cards.length === 0) return;
    const center = root.scrollLeft + root.clientWidth / 2;
    let closest = 0;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    setActiveIndex(closest);
  }, [cards.length]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    syncIndexFromScroll();
    root.addEventListener("scroll", syncIndexFromScroll, { passive: true });
    window.addEventListener("resize", syncIndexFromScroll);
    return () => {
      root.removeEventListener("scroll", syncIndexFromScroll);
      window.removeEventListener("resize", syncIndexFromScroll);
    };
  }, [syncIndexFromScroll]);

  function scrollToIndex(index: number) {
    const root = scrollRef.current;
    if (!root) return;
    const child = root.children[index] as HTMLElement | undefined;
    if (!child) return;
    const target =
      child.offsetLeft - (root.clientWidth - child.offsetWidth) / 2;
    root.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    setActiveIndex(index);
  }

  function go(delta: number) {
    const next = Math.min(cards.length - 1, Math.max(0, activeIndex + delta));
    scrollToIndex(next);
  }

  if (cards.length === 0) return null;

  return (
    <div className="mt-10">
      {canSwipe ? (
        <p className="mb-3 text-center text-xs text-muted-foreground sm:text-left">
          Swipe or use arrows to browse ambassadors
        </p>
      ) : null}

      <div className="relative">
        {canSwipe ? (
          <>
            <button
              type="button"
              aria-label="Previous ambassador"
              onClick={() => go(-1)}
              disabled={activeIndex === 0}
              className="absolute left-0 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-card/95 p-2 text-heading shadow-sm transition hover:border-primary/40 disabled:pointer-events-none disabled:opacity-30 sm:flex"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next ambassador"
              onClick={() => go(1)}
              disabled={activeIndex === cards.length - 1}
              className="absolute right-0 top-1/2 z-10 hidden translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-card/95 p-2 text-heading shadow-sm transition hover:border-primary/40 disabled:pointer-events-none disabled:opacity-30 sm:flex"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            "flex gap-4 overflow-x-auto scroll-smooth pb-1",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            canSwipe && "snap-x snap-mandatory px-1",
          )}
        >
          {cards.map((diver, index) => (
            <div
              key={diver.username}
              className={cn(
                "shrink-0",
                canSwipe
                  ? "w-[min(100%,20rem)] snap-center sm:w-[min(85%,22rem)]"
                  : "w-full max-w-md",
                !canSwipe && index > 0 && "hidden",
              )}
            >
              <AmbassadorCard diver={diver} />
            </div>
          ))}
        </div>

        {canSwipe ? (
          <div className="mt-5 flex items-center justify-center gap-2">
            {cards.map((diver, index) => (
              <button
                key={diver.username}
                type="button"
                aria-label={`Go to ${diver.fullName}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === activeIndex ? "w-6 bg-primary" : "w-2 bg-border hover:bg-primary/40",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
