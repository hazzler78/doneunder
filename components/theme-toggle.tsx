"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const order = ["system", "light", "dark"] as const;

const labels: Record<(typeof order)[number], string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = order.includes(theme as (typeof order)[number])
    ? (theme as (typeof order)[number])
    : "system";
  const next = order[(order.indexOf(current) + 1) % order.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/70 text-heading-muted transition hover:bg-muted hover:text-heading"
      aria-label={
        mounted
          ? `Theme: ${labels[current]}. Click for ${labels[next]}.`
          : "Toggle color theme"
      }
      title={mounted ? `Theme: ${labels[current]}` : "Theme"}
      onClick={() => setTheme(next)}
    >
      {mounted ? <Icon className="h-4 w-4" /> : <span className="h-4 w-4" />}
    </button>
  );
}
