"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/app/auth/actions";

const links = [
  { href: "/#pipeline", label: "Pipeline" },
  { href: "/#agent", label: "Agent" },
  { href: "/jobs", label: "Jobs" },
  { href: "/pricing", label: "Companies" },
];

type Props = {
  isLoggedIn: boolean;
  dashboardHref: string;
  pendingMail?: { from: string; subject: string } | null;
};

export function SiteHeaderClient({ isLoggedIn, dashboardHref, pendingMail }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const onWorkspace = pathname === "/workspace";
  const hasMail = Boolean(pendingMail);

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-header backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between section-pad py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition hover:opacity-90"
          onClick={() => setOpen(false)}
        >
          <Image
            src="/doneunder_logo.jpg"
            alt="doneunder.ai"
            width={36}
            height={36}
            className="h-9 w-9 rounded-full object-cover"
            priority
          />
          <span className="font-display text-lg font-semibold tracking-tight text-heading-muted">
            doneunder.ai
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted/60 hover:text-heading"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoggedIn ? (
            <>
              <Link href={onWorkspace ? "/" : dashboardHref} className="hidden sm:block">
                <Button size="sm" variant={onWorkspace ? "outline" : "default"}>
                  {onWorkspace ? "Close workspace" : "Open workspace"}
                  {hasMail ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Mail
                    </span>
                  ) : null}
                </Button>
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
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/70 text-heading-muted md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            {hasMail ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" /> : null}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border/50 bg-muted md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-1 section-pad py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-sm text-heading/90 hover:bg-muted/50"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-border/40 pt-3">
              {isLoggedIn ? (
                <>
                  {hasMail ? (
                    <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-heading">
                      New mail from {pendingMail?.from}. Open workspace to reply.
                    </p>
                  ) : null}
                  <Link href={onWorkspace ? "/" : dashboardHref} onClick={() => setOpen(false)}>
                    <Button className="w-full" size="sm" variant={onWorkspace ? "outline" : "default"}>
                      {onWorkspace ? "Close workspace" : "Open workspace"}
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
