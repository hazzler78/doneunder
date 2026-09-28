/** Vertical focal point 0–100 stored on avatar_url as `fy` query param. */

export function clampFocalY(value: unknown, fallback = 30) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function readAvatarFocalY(avatarUrl?: string | null, fallback = 30) {
  if (!avatarUrl?.trim()) return fallback;
  try {
    const parsed = new URL(avatarUrl);
    return clampFocalY(parsed.searchParams.get("fy"), fallback);
  } catch {
    return fallback;
  }
}

export function withAvatarFocalY(avatarUrl: string, focalY: number) {
  const fy = clampFocalY(focalY);
  try {
    const parsed = new URL(avatarUrl);
    parsed.searchParams.set("fy", String(fy));
    if (!parsed.searchParams.get("v")) {
      parsed.searchParams.set("v", String(Date.now()));
    }
    return parsed.toString();
  } catch {
    const join = avatarUrl.includes("?") ? "&" : "?";
    return `${avatarUrl}${join}fy=${fy}`;
  }
}

export function avatarImageSrc(avatarUrl?: string | null) {
  return avatarUrl?.trim() || null;
}
