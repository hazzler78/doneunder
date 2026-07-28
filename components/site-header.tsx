import { SiteHeaderClient } from "@/components/site-header-client";
import { isSupabaseConfigured } from "@/lib/feature-flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function dashboardHrefForRole(role: string | undefined) {
  if (role === "admin") return "/dashboard/admin";
  return "/workspace";
}

export async function SiteHeader() {
  let isLoggedIn = false;
  let dashboardHref = "/workspace";

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      isLoggedIn = Boolean(user);
      if (user?.id) {
        const { data: userRow } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
        dashboardHref = dashboardHrefForRole(userRow?.role);
      }
    } catch {
      isLoggedIn = false;
    }
  }

  return <SiteHeaderClient isLoggedIn={isLoggedIn} dashboardHref={dashboardHref} />;
}
