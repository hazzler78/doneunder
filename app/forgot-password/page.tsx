import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { forgotPasswordAction } from "@/app/auth/actions";

export const metadata: Metadata = {
  title: "Forgot password | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const isSuccess = Boolean(message?.toLowerCase().includes("if an account exists"));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center section-pad py-12 sm:py-16">
      <div className="mb-8 text-center">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          doneunder.ai
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading">
          Reset password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We email a reset link to the address on your account. Use the same email you registered
          with (Outlook, Gmail, company mail, etc.).
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/90 p-5 sm:p-6">
        {message ? (
          <p
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              isSuccess
                ? "border-success/30 bg-success/10 text-heading"
                : "border-amber-400/25 bg-amber-400/10 text-amber-950 dark:text-amber-100"
            }`}
          >
            {message}
          </p>
        ) : null}

        <form action={forgotPasswordAction} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Email or username</span>
            <input
              type="text"
              name="email"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="you@outlook.com or janediver"
            />
          </label>
          <Button type="submit" className="h-11 w-full">
            Send reset link
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground">
          Signed up with Google? Use <span className="text-heading">Continue with Google</span> on
          the sign-in page instead — that account may not have a separate password.
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
