"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/auth/actions";

const links = [
  { href: "/#pipeline", label: "Pipeline" },
  { href: "/#agent", label: "Agent" },
  { href: "/jobs", label: "Jobs" },
  { href: "/pricing", label: "Pricing" },
];

type Props = {
  isLoggedIn: boolean;
  dashboardHref: string;
};

export function SiteHeaderClient({ isLoggedIn, dashboardHref }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-[#03070d]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between section-pad py-3.5">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-cyan-100 transition hover:text-white"
          onClick={() => setOpen(false)}
        >
          doneunder.ai
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-cyan-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isLoggedIn ? (
            <>
              <Link href={dashboardHref} className="hidden sm:block">
                <Button size="sm">Open workspace</Button>
              </Link>
              <form action={logoutAction} className="hidden sm:block">
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block">
                <Button size="sm" variant="ghost">
                  Sign in
                </Button>
              </Link>
              <Link href="/register" className="hidden sm:block">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/70 text-cyan-100 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border/50 bg-[#050b14] md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-1 section-pad py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-sm text-cyan-50/90 hover:bg-muted/50"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/40 pt-3">
              {isLoggedIn ? (
                <>
                  <Link href={dashboardHref} onClick={() => setOpen(false)}>
                    <Button className="w-full" size="sm">
                      Open workspace
                    </Button>
                  </Link>
                  <form action={logoutAction}>
                    <Button type="submit" variant="outline" className="w-full" size="sm">
                      Sign out
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)}>
                    <Button variant="outline" className="w-full" size="sm">
                      Sign in
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setOpen(false)}>
                    <Button className="w-full" size="sm">
                      Get started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
