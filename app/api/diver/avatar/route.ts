import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { clampFocalY, clampZoom, withAvatarFraming } from "@/lib/avatar-focal";

export const runtime = "nodejs";

const BUCKET = "diver-avatars";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function publicAvatarUrl(userId: string, ext: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/${userId}/avatar.${ext}`;
}

async function ensureAvatarBucket(supabase: SupabaseClient) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  const exists = (buckets ?? []).some((bucket) => bucket.id === BUCKET || bucket.name === BUCKET);
  if (exists) {
    await supabase.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: "5MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    return;
  }
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const form = await request.formData();
    const file = form.get("avatar");
    const focalY = clampFocalY(form.get("fy"), 30);
    const zoom = clampZoom(form.get("z"), 100);
    if (!(file instanceof File) || file.size < 1) {
      return NextResponse.json({ error: "Choose a photo (JPG, PNG, or WebP)." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Photo must be under 5 MB." }, { status: 400 });
    }
    const type = (file.type || "").toLowerCase();
    if (!ALLOWED.has(type)) {
      return NextResponse.json({ error: "Use JPG, PNG, or WebP." }, { status: 400 });
    }

    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const path = `${authResult.diverId}/avatar.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const service = createServiceSupabaseClient();

    await ensureAvatarBucket(service);

    for (const oldExt of ["jpg", "jpeg", "png", "webp"]) {
      if (oldExt === ext) continue;
      await service.storage.from(BUCKET).remove([`${authResult.diverId}/avatar.${oldExt}`]);
    }

    const { error: uploadError } = await service.storage.from(BUCKET).upload(path, bytes, {
      contentType: type,
      upsert: true,
      cacheControl: "3600",
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const avatarUrl = withAvatarFraming(
      `${publicAvatarUrl(authResult.diverId, ext)}?v=${Date.now()}`,
      { fy: focalY, z: zoom },
    );
    const { error: updateError } = await service
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", authResult.diverId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, avatarUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = (await request.json().catch(() => ({}))) as { fy?: unknown; z?: unknown };
    const framing = {
      fy: body.fy !== undefined ? clampFocalY(body.fy) : undefined,
      z: body.z !== undefined ? clampZoom(body.z) : undefined,
    };
    const service = createServiceSupabaseClient();
    const { data: userRow, error: loadError } = await service
      .from("users")
      .select("avatar_url")
      .eq("id", authResult.diverId)
      .maybeSingle();
    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }
    if (!userRow?.avatar_url) {
      return NextResponse.json({ error: "Upload a photo first." }, { status: 400 });
    }

    const avatarUrl = withAvatarFraming(userRow.avatar_url, framing);
    const { error: updateError } = await service
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", authResult.diverId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, avatarUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save framing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
