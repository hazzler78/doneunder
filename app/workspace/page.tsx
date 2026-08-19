import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent-workspace";
import { ensureDiverProfileForAuthUser } from "@/lib/diver-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const metadata: Metadata = {
  title: "Workspace | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function WorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let { data: userRow } = await supabase
    .from("users")
    .select("id, role, full_name, username, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow) {
    try {
      userRow = await ensureDiverProfileForAuthUser(user);
    } catch (error) {
      console.error("Failed to create diver profile for workspace:", error);
    }
  }

  const role = (userRow?.role as UserRole | undefined) ?? "diver";
  if (role === "admin") {
    redirect("/dashboard/admin");
  }

  return (
    <AgentWorkspace
      role={role}
      userId={user.id}
      displayName={userRow?.full_name ?? "User"}
      username={userRow?.username ?? null}
    />
  );
}
