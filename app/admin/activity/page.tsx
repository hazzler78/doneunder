import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Company activity | doneunder.ai",
  robots: { index: false, follow: false },
};

/** Flag companies revealing unusually many divers in a day. */
const REVEALS_PER_DAY_FLAG = 10;

type ActivityRow = {
  user_id: string;
  company_name: string | null;
  plan: string | null;
  subscription_status: string | null;
  searches_30d: number;
  reveals_30d: number;
  reveals_24h: number;
  last_reveal: string | null;
  subscription_current_period_end: string | null;
  open_one_time_searches: number | null;
  one_time_purchases_30d: number | null;
};

type RevealRow = {
  id: string;
  company_id: string;
  diver_id: string;
  slot: number;
  criteria: unknown;
  created_at: string;
};

export default async function AdminActivityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/admin/activity")}`);

  const { data: actor } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  if (actor?.role !== "admin") redirect("/workspace");

  const [{ data: activity }, { data: reveals }] = await Promise.all([
    supabase
      .from("admin_company_activity")
      .select(
        "user_id,company_name,plan,subscription_status,searches_30d,reveals_30d,reveals_24h,last_reveal,subscription_current_period_end,open_one_time_searches,one_time_purchases_30d",
      )
      .order("reveals_30d", { ascending: false })
      .returns<ActivityRow[]>(),
    supabase
      .from("match_reveals")
      .select("id,company_id,diver_id,slot,criteria,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<RevealRow[]>(),
  ]);

  const ids = Array.from(new Set((reveals ?? []).flatMap((r) => [r.company_id, r.diver_id])));
  const { data: people } = ids.length
    ? await supabase.from("users").select("id,full_name,username").in("id", ids)
    : { data: [] as { id: string; full_name: string | null; username: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.username || p.id]));
  const companyName = new Map((activity ?? []).map((a) => [a.user_id, a.company_name]));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 text-sm">
      <h1 className="text-3xl font-bold">Company activity</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Last 30 days</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Company</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Renews</th>
              <th>One-time open / bought 30d</th>
              <th>Searches</th>
              <th>Reveals</th>
              <th>Reveals 24h</th>
              <th>Last reveal</th>
            </tr>
          </thead>
          <tbody>
            {(activity ?? []).map((row) => (
              <tr key={row.user_id} className="border-b">
                <td className="py-2">{row.company_name ?? row.user_id}</td>
                <td>{row.plan ?? "–"}</td>
                <td>{row.subscription_status ?? "–"}</td>
                <td>
                  {row.subscription_current_period_end
                    ? new Date(row.subscription_current_period_end).toLocaleDateString("en-GB")
                    : "–"}
                </td>
                <td>
                  {row.open_one_time_searches ?? 0} / {row.one_time_purchases_30d ?? 0}
                </td>
                <td>{row.searches_30d}</td>
                <td>{row.reveals_30d}</td>
                <td className={row.reveals_24h >= REVEALS_PER_DAY_FLAG ? "font-bold text-destructive" : undefined}>
                  {row.reveals_24h}
                  {row.reveals_24h >= REVEALS_PER_DAY_FLAG ? " ⚠" : ""}
                </td>
                <td>{row.last_reveal ? new Date(row.last_reveal).toLocaleString("en-GB") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Latest reveals</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Time</th>
              <th>Company</th>
              <th>Diver</th>
              <th>Criteria</th>
            </tr>
          </thead>
          <tbody>
            {(reveals ?? []).map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="py-2">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                <td>{companyName.get(r.company_id) ?? nameOf.get(r.company_id) ?? r.company_id}</td>
                <td>{nameOf.get(r.diver_id) ?? r.diver_id}</td>
                <td className="max-w-md break-all font-mono text-xs">{JSON.stringify(r.criteria)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
