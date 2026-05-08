import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DiverCvPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: user } = await supabase
    .from("users")
    .select("id,full_name")
    .eq("username", username)
    .eq("role", "diver")
    .maybeSingle();

  if (!user) notFound();

  const { data: profile } = await supabase
    .from("diver_profiles")
    .select("polished_cv_markdown,headline,location,mobilization_notice")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 text-sm leading-relaxed print:max-w-none print:px-0 print:py-0">
      <header className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold">{user.full_name}</h1>
        <p className="font-semibold">{profile.headline ?? "Commercial Diver CV"}</p>
        <p>{profile.location || "Location not provided"} • {profile.mobilization_notice || "Mobilization not provided"}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Polished CV</h2>
        <pre className="whitespace-pre-wrap rounded-lg border bg-[#071725] p-4 font-sans text-sm">
          {profile.polished_cv_markdown || "No polished CV has been generated yet."}
        </pre>
        <p className="text-xs text-amber-300">AI-generated - always verify details before sending to clients.</p>
      </section>
    </main>
  );
}
