import Link from "next/link";
import Image from "next/image";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";

const footerLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/jobs", label: "Jobs" },
  { href: "/pricing", label: "Companies" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 section-pad py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image
              src="/doneunder_logo.jpg"
              alt="doneunder.ai"
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-heading-muted">
              doneunder.ai
            </span>
          </Link>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Commercial diving talent marketplace — verification-first matching for Offshore and
            Inshore teams.
          </p>
          <p className="mt-3 text-sm">
            <a href={CONTACT_MAILTO} className="text-heading-muted/90 transition hover:text-heading">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-heading-muted">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-border/40">
        <p className="mx-auto w-full max-w-6xl section-pad py-4 text-xs text-muted-foreground/80">
          © {new Date().getFullYear()} doneunder.ai
        </p>
      </div>
    </footer>
  );
}
