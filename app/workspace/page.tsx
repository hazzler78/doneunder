import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AgentWorkspace } from "@/components/agent-workspace";
import { ensureDiverProfileForAuthUser } from "@/lib/diver-auth";
import { findCatalogJob, matchPromptForJob, workspaceMatchHref } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export const metadata: Metadata = {
  title: "Workspace | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job: jobId } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = jobId ? workspaceMatchHref(jobId) : "/workspace";
    redirect(`/login?next=${encodeURIComponent(next)}`);
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

  const matchJob = jobId ? findCatalogJob(jobId) : null;

  return (
    <AgentWorkspace
      role={role}
      userId={user.id}
      displayName={userRow?.full_name ?? "User"}
      username={userRow?.username ?? null}
      initialMatchPrompt={matchJob ? matchPromptForJob(matchJob) : null}
    />
  );
}
