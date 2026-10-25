import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { updatePasswordAction } from "@/app/auth/actions";
import { userHasEmailPasswordIdentity, userHasGoogleIdentity } from "@/lib/auth-identities";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose new password | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col justify-center section-pad py-12 sm:py-16">
        <div className="rounded-2xl border border-border/60 bg-card/90 p-5 sm:p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-heading">
            Link expired
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Open a fresh reset link from your email, or request a new one.
          </p>
          <p className="mt-5 text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Request a new reset link
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const hasGoogle = userHasGoogleIdentity(user);
  const hasEmailIdentity = userHasEmailPasswordIdentity(user);
  const googleAddingPassword = hasGoogle && !hasEmailIdentity;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center section-pad py-12 sm:py-16">
      <div className="mb-8 text-center">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          doneunder.ai
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading">
          {googleAddingPassword ? "Add a password" : "Choose a new password"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {user.email}.{" "}
          {googleAddingPassword
            ? "You can keep using Continue with Google, or add a password here to sign in with email as well."
            : "Pick a password of at least 8 characters."}
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/90 p-5 sm:p-6">
        {message ? (
          <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {message}
          </p>
        ) : null}

        <form action={updatePasswordAction} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">New password</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Confirm password</span>
            <input
              type="password"
              name="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
            />
          </label>
          <Button type="submit" className="h-11 w-full">
            {googleAddingPassword ? "Save password" : "Save new password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
