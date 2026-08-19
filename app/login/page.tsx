import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { loginAction } from "@/app/auth/actions";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export const metadata: Metadata = {
  title: "Sign in | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center section-pad py-12 sm:py-16">
      <div className="mb-8 text-center">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          doneunder.ai
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One account for divers and companies. We route you to the right workspace.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-[#060e18]/90 p-5 sm:p-6">
        {message ? (
          <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <Link
            href="/register"
            className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 transition hover:border-primary/30"
          >
            <p className="text-xs font-medium text-primary">New — Diver</p>
            <p className="mt-1 text-sm text-cyan-50">Create free account</p>
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3 transition hover:border-primary/30"
          >
            <p className="text-xs font-medium text-primary">New — Company</p>
            <p className="mt-1 text-sm text-cyan-50">Contact us</p>
          </Link>
        </div>

        <GoogleSignInButton label="Continue with Google" />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Divers: Google opens your workspace. New Google users get a free diver account.
        </p>
        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border/70" />
          or email
          <span className="h-px flex-1 bg-border/70" />
        </div>

        <form action={loginAction} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Email or username</span>
            <input
              type="text"
              name="email"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-border/70 bg-[#03070d] px-3 py-2.5 text-sm text-cyan-50 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="you@example.com or janediver"
            />
            <span className="block text-xs text-muted-foreground/80">
              Use your registration email or public username.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-border/70 bg-[#03070d] px-3 py-2.5 text-sm text-cyan-50 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
            />
          </label>
          <Button type="submit" className="h-11 w-full">
            Sign in
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Register as a diver
        </Link>
      </p>
    </div>
  );
}
