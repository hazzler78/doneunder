import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sourceSchema = z.enum(["manual", "ai", "linkedin"]);

const experienceSchema = z.object({
  id: z.string().uuid().optional(),
  company: z.string().min(1),
  project_name: z.string().optional(),
  location: z.string().optional(),
  role_title: z.string().min(1),
  date_start: z.string().optional(),
  date_end: z.string().optional(),
  summary: z.string().optional(),
  source: sourceSchema.optional(),
  source_ref: z.string().optional(),
});

const certificationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
  cert_number: z.string().optional(),
  issuing_body: z.string().optional(),
  source: sourceSchema.optional(),
  source_ref: z.string().optional(),
});

const referenceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().optional(),
  source: sourceSchema.optional(),
  source_ref: z.string().optional(),
});

const profileSchema = z.object({
  headline: z.string().max(180),
  bio: z.string().max(2000),
  location: z.string().max(180),
  mobilization_notice: z.string().max(180),
  availability_status: z.enum(["available", "deployed"]).default("available"),
  sat_hours: z.number().int().min(0),
  dive_hours: z.number().int().min(0),
  polished_cv_markdown: z.string().max(40000).optional(),
  polished_cv_json: z.record(z.string(), z.unknown()).nullable().optional(),
  ambassador_public_headline: z.string().max(220).optional(),
  ambassador_short_bio: z.string().max(1200).optional(),
  ambassador_key_highlights: z.array(z.string().max(180)).max(12).optional(),
  headline_source: sourceSchema.optional(),
  headline_source_ref: z.string().optional(),
  bio_source: sourceSchema.optional(),
  bio_source_ref: z.string().optional(),
  import_batch_id: z.string().uuid().nullable().optional(),
  experiences: z.array(experienceSchema).max(50),
  certifications: z.array(certificationSchema).max(50),
  references: z.array(referenceSchema).max(20),
});

async function getAuthenticatedDiverId() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  let { data: userRecord } = await supabase
    .from("users")
    .select("id, role, full_name, username")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!userRecord) {
    const fullName =
      (auth.user.user_metadata?.full_name as string | undefined)?.trim() ||
      (auth.user.email ? auth.user.email.split("@")[0] : "Diver");
    const username =
      (auth.user.user_metadata?.username as string | undefined)?.trim().toLowerCase() ||
      (auth.user.email ? auth.user.email.split("@")[0].toLowerCase() : `diver-${auth.user.id.slice(0, 8)}`);

    const { data: inserted, error: insertError } = await supabase
      .from("users")
      .upsert(
        {
          id: auth.user.id,
          role: "diver",
          email: auth.user.email ?? `${auth.user.id}@placeholder.local`,
          username,
          full_name: fullName,
        },
        { onConflict: "id" },
      )
      .select("id, role, full_name, username")
      .maybeSingle();

    if (insertError) {
      return {
        error: NextResponse.json(
          { error: `Profile bootstrap failed: ${insertError.message}` },
          { status: 403 },
        ),
      };
    }
    userRecord = inserted ?? null;
  }

  if (!userRecord || userRecord.role !== "diver") {
    return {
      error: NextResponse.json(
        { error: "Forbidden. This endpoint requires a diver account." },
        { status: 403 },
      ),
    };
  }

  return { diverId: auth.user.id, supabase };
}

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverId();
    if ("error" in authResult) return authResult.error;
    const { diverId, supabase } = authResult;

    const { data: profile } = await supabase
      .from("diver_profiles")
      .select(
        "headline,bio,location,mobilization_notice,availability_status,sat_hours,dive_hours,polished_cv_markdown,polished_cv_json,ambassador_public_headline,ambassador_short_bio,ambassador_key_highlights,headline_source,headline_source_ref,bio_source,bio_source_ref,import_batch_id",
      )
      .eq("user_id", diverId)
      .maybeSingle();

    const [{ data: experiences }, { data: certifications }, { data: references }] = await Promise.all([
      supabase
        .from("diver_experiences")
        .select("id,company,project_name,location,role_title,date_start,date_end,summary,source,source_ref")
        .eq("diver_id", diverId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("diver_certifications")
        .select("id,name,issue_date,expiry_date,cert_number,issuing_body,source,source_ref")
        .eq("diver_id", diverId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("diver_references")
        .select("id,name,company,phone,email,source,source_ref")
        .eq("diver_id", diverId)
        .order("sort_order", { ascending: true }),
    ]);

    return NextResponse.json({
      profile: profile ?? {
        headline: "",
        bio: "",
        location: "",
        mobilization_notice: "",
        availability_status: "available",
        sat_hours: 0,
        dive_hours: 0,
        polished_cv_markdown: "",
        polished_cv_json: null,
        ambassador_public_headline: "",
        ambassador_short_bio: "",
        ambassador_key_highlights: [],
        headline_source: "manual",
        bio_source: "manual",
      },
      experiences: experiences ?? [],
      certifications: certifications ?? [],
      references: references ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unable to load diver profile." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverId();
    if ("error" in authResult) return authResult.error;
    const { diverId, supabase } = authResult;

    const body = profileSchema.parse(await req.json());

    const { error: profileError } = await supabase.from("diver_profiles").upsert(
      {
        user_id: diverId,
        headline: body.headline,
        bio: body.bio,
        location: body.location,
        mobilization_notice: body.mobilization_notice,
        availability_status: body.availability_status,
        sat_hours: body.sat_hours,
        dive_hours: body.dive_hours,
        polished_cv_markdown: body.polished_cv_markdown ?? null,
        polished_cv_json: body.polished_cv_json ?? null,
        ambassador_public_headline: body.ambassador_public_headline ?? null,
        ambassador_short_bio: body.ambassador_short_bio ?? null,
        ambassador_key_highlights: body.ambassador_key_highlights ?? [],
        headline_source: body.headline_source ?? "manual",
        headline_source_ref: body.headline_source_ref ?? null,
        bio_source: body.bio_source ?? "manual",
        bio_source_ref: body.bio_source_ref ?? null,
        import_batch_id: body.import_batch_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (profileError) {
      return NextResponse.json({ error: "Could not save profile." }, { status: 400 });
    }

    await Promise.all([
      supabase.from("diver_experiences").delete().eq("diver_id", diverId),
      supabase.from("diver_certifications").delete().eq("diver_id", diverId),
      supabase.from("diver_references").delete().eq("diver_id", diverId),
    ]);

    if (body.experiences.length > 0) {
      await supabase.from("diver_experiences").insert(
        body.experiences.map((item, index) => ({
          diver_id: diverId,
          company: item.company,
          project_name: item.project_name || null,
          location: item.location || null,
          role_title: item.role_title,
          date_start: item.date_start || null,
          date_end: item.date_end || null,
          summary: item.summary || null,
          sort_order: index,
          source: item.source ?? "manual",
          source_ref: item.source_ref || null,
          import_batch_id: body.import_batch_id ?? null,
        })),
      );
    }

    if (body.certifications.length > 0) {
      await supabase.from("diver_certifications").insert(
        body.certifications.map((item, index) => ({
          diver_id: diverId,
          name: item.name,
          issue_date: item.issue_date || null,
          expiry_date: item.expiry_date || null,
          cert_number: item.cert_number || null,
          issuing_body: item.issuing_body || null,
          sort_order: index,
          source: item.source ?? "manual",
          source_ref: item.source_ref || null,
          import_batch_id: body.import_batch_id ?? null,
        })),
      );
    }

    if (body.references.length > 0) {
      await supabase.from("diver_references").insert(
        body.references.map((item, index) => ({
          diver_id: diverId,
          name: item.name,
          company: item.company || null,
          phone: item.phone,
          email: item.email || null,
          sort_order: index,
          source: item.source ?? "manual",
          source_ref: item.source_ref || null,
          import_batch_id: body.import_batch_id ?? null,
        })),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save diver profile." }, { status: 500 });
  }
}
