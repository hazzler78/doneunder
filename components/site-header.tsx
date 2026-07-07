import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const links = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Jobs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How It Works" },
];

function dashboardHrefForRole(role: string | undefined) {
  if (role === "admin") return "/dashboard/admin";
  return "/workspace";
}

export async function SiteHeader() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let dashboardHref = "/workspace";
  if (user?.id) {
    const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    dashboardHref = dashboardHrefForRole(userRow?.role);
  }

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
          {user ? (
            <>
              <Link href={dashboardHref}>
                <Button size="sm">Dashboard</Button>
              </Link>
              <form action={logoutAction}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
