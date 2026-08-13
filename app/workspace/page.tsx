import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent-workspace";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { claimPreferredUsername } from "@/lib/usernames";

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

  const { data: userRow } = await supabase
    .from("users")
    .select("id, role, full_name, username, email")
    .eq("id", user.id)
    .maybeSingle();

  const role = (userRow?.role as UserRole | undefined) ?? "diver";
  if (role === "admin") {
    redirect("/dashboard/admin");
  }

  let username = userRow?.username ?? null;
  if (role === "diver") {
    try {
      const claimed = await claimPreferredUsername(createServiceSupabaseClient(), {
        userId: user.id,
        email: userRow?.email ?? user.email,
        currentUsername: userRow?.username,
        metadataUsername: typeof user.user_metadata?.username === "string" ? user.user_metadata.username : null,
      });
      username = claimed ?? username;
    } catch (error) {
      console.error("Failed to claim preferred username:", error);
    }
  }

  return (
    <AgentWorkspace
      role={role}
      userId={user.id}
      displayName={userRow?.full_name ?? "User"}
      username={username}
    />
  );
}
