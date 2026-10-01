"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { workspaceFixHref } from "@/lib/preview-fix";

type Props = {
  children: React.ReactNode;
  className?: string;
};

type ToolbarState = {
  text: string;
  top: number;
  left: number;
};

/**
 * Lets divers highlight CV preview text and jump to Hermes with that quote prefilled.
 */
export function PreviewHighlightToHermes({ children, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);

  const clearToolbar = useCallback(() => setToolbar(null), []);

  const updateFromSelection = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      clearToolbar();
      return;
    }
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (text.length < 8) {
      clearToolbar();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      clearToolbar();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      clearToolbar();
      return;
    }
    const rootRect = root.getBoundingClientRect();
    setToolbar({
      text,
      top: rect.top - rootRect.top - 44,
      left: Math.min(
        Math.max(rect.left - rootRect.left + rect.width / 2, 80),
        Math.max(rootRect.width - 80, 80),
      ),
    });
  }, [clearToolbar]);

  useEffect(() => {
    const onMouseUp = () => {
      window.setTimeout(updateFromSelection, 0);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearToolbar();
      else window.setTimeout(updateFromSelection, 0);
    };
    const onScroll = () => clearToolbar();
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [clearToolbar, updateFromSelection]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <p className="mb-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-heading print:hidden">
        Highlight any text, then tap <strong>Ask Hermes to fix this</strong> — easier than describing the
        change in chat.
      </p>
      {children}
      {toolbar ? (
        <div
          className="absolute z-20 -translate-x-1/2 print:hidden"
          style={{ top: toolbar.top, left: toolbar.left }}
        >
          <Link
            href={workspaceFixHref(toolbar.text)}
            className="inline-flex items-center rounded-full border border-primary/40 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
            onClick={clearToolbar}
          >
            Ask Hermes to fix this
          </Link>
        </div>
      ) : null}
    </div>
  );
}
