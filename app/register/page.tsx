import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { registerAction } from "@/app/auth/actions";

export const metadata: Metadata = {
  title: "Create account | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
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
          Create diver account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Free to start. Upload your CV and chat with Hermes in your workspace.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-[#060e18]/90 p-5 sm:p-6">
        {message ? (
          <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}

        <form action={registerAction} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Full name</span>
            <input
              type="text"
              name="fullName"
              required
              autoComplete="name"
              className="w-full rounded-lg border border-border/70 bg-[#03070d] px-3 py-2.5 text-sm text-cyan-50 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="Jane Diver"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Username</span>
            <input
              type="text"
              name="username"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-border/70 bg-[#03070d] px-3 py-2.5 text-sm text-cyan-50 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="janediver"
            />
            <span className="block text-xs text-muted-foreground/80">
              Public handle for your ambassador page (doneunder.ai/janediver).
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-border/70 bg-[#03070d] px-3 py-2.5 text-sm text-cyan-50 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="you@example.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-border/70 bg-[#03070d] px-3 py-2.5 text-sm text-cyan-50 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="Min. 8 characters"
            />
          </label>
          <Button type="submit" className="h-11 w-full">
            Create account
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
