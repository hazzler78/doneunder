import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { registerAction } from "@/app/auth/actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Create diver account</CardTitle>
          <CardDescription>Register as a diver and start building your profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? <p className="text-sm text-amber-300">{message}</p> : null}
          <form action={registerAction} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Full name</span>
              <input
                type="text"
                name="fullName"
                required
                className="w-full rounded-md border bg-transparent p-2"
                placeholder="Jane Diver"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Username</span>
              <input
                type="text"
                name="username"
                required
                className="w-full rounded-md border bg-transparent p-2"
                placeholder="janediver"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Email</span>
              <input
                type="email"
                name="email"
                required
                className="w-full rounded-md border bg-transparent p-2"
                placeholder="you@example.com"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Password (min 8 chars)</span>
              <input
                type="password"
                name="password"
                minLength={8}
                required
                className="w-full rounded-md border bg-transparent p-2"
                placeholder="********"
              />
            </label>
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-300 underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
