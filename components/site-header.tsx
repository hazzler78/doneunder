import Link from "next/link";
import { Anchor, BriefcaseBusiness, Home, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/pricing", label: "Pricing", icon: Anchor },
  { href: "/how-it-works", label: "How It Works", icon: ShieldCheck },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-[#061322]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-wide text-cyan-300">
          doneunder.ai
        </Link>
        <nav className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-cyan-100/90 transition hover:bg-muted hover:text-cyan-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/register">
            <Button variant="secondary" size="sm">
              Join as Diver
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="sm">
              Login
            </Button>
          </Link>
          <Link href="/dashboard/company">
            <Button size="sm">For Companies</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
