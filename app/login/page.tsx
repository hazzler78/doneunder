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
          <CardDescription>Access your diver dashboard and CV tools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? <p className="text-sm text-amber-300">{message}</p> : null}
          <form action={loginAction} className="space-y-3">
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
            New diver?{" "}
            <Link href="/register" className="text-cyan-300 underline">
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
