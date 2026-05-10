import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loginAction } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            One account for divers and companies. After you sign in, we send you to the right dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? <p className="text-sm text-amber-300">{message}</p> : null}
          <div className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-cyan-200">New — Diver (free)</p>
              <Link href="/register" className="text-cyan-300 underline">
                Create diver account
              </Link>
            </div>
            <div>
              <p className="text-xs font-medium text-cyan-200">New — Company</p>
              <Link href="/pricing" className="text-cyan-300 underline">
                View plans &amp; subscribe
              </Link>
            </div>
          </div>
          <form action={loginAction} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Email or username</span>
              <input
                type="text"
                name="email"
                required
                autoComplete="username"
                className="w-full rounded-md border bg-transparent p-2"
                placeholder="you@example.com or janediver"
              />
              <span className="text-xs text-slate-500">
                Use the same email you registered with, or your public username — not your display name.
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Password</span>
              <input
                type="password"
                name="password"
                required
                className="w-full rounded-md border bg-transparent p-2"
                placeholder="********"
              />
            </label>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            Admin access uses the same sign-in; your account must be marked as admin in the system.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
