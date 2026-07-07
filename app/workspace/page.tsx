import { redirect } from "next/navigation";
import { AgentWorkspace } from "@/components/agent-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export default async function WorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role, full_name, username")
    .eq("id", user.id)
    .maybeSingle();

  const role = (userRow?.role as UserRole | undefined) ?? "diver";
  if (role === "admin") {
    redirect("/dashboard/admin");
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <AgentWorkspace
        role={role}
        userId={user.id}
        displayName={userRow?.full_name ?? "User"}
        username={userRow?.username ?? null}
      />
    </div>
  );
}
