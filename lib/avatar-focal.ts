/** Framing stored on avatar_url query params: fy (0–100), z (100–250 = 1.0x–2.5x). */

export type AvatarFraming = {
  fy: number;
  z: number;
};

export const DEFAULT_AVATAR_FRAMING: AvatarFraming = { fy: 30, z: 100 };

export function clampFocalY(value: unknown, fallback = DEFAULT_AVATAR_FRAMING.fy) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Zoom percent: 100 = fit, 250 = 2.5×. */
export function clampZoom(value: unknown, fallback = DEFAULT_AVATAR_FRAMING.z) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(250, Math.max(100, Math.round(n)));
}

export function readAvatarFraming(avatarUrl?: string | null): AvatarFraming {
  if (!avatarUrl?.trim()) return { ...DEFAULT_AVATAR_FRAMING };
  try {
    const parsed = new URL(avatarUrl);
    return {
      fy: clampFocalY(parsed.searchParams.get("fy")),
      z: clampZoom(parsed.searchParams.get("z")),
    };
  } catch {
    return { ...DEFAULT_AVATAR_FRAMING };
  }
}

export function readAvatarFocalY(avatarUrl?: string | null, fallback = DEFAULT_AVATAR_FRAMING.fy) {
  return readAvatarFraming(avatarUrl).fy || fallback;
}

export function withAvatarFraming(
  avatarUrl: string,
  framing: Partial<AvatarFraming>,
  current?: AvatarFraming,
) {
  const base = current ?? readAvatarFraming(avatarUrl);
  const next: AvatarFraming = {
    fy: framing.fy !== undefined ? clampFocalY(framing.fy) : base.fy,
    z: framing.z !== undefined ? clampZoom(framing.z) : base.z,
  };
  try {
    const parsed = new URL(avatarUrl);
    parsed.searchParams.set("fy", String(next.fy));
    parsed.searchParams.set("z", String(next.z));
    if (!parsed.searchParams.get("v")) {
      parsed.searchParams.set("v", String(Date.now()));
    }
    return parsed.toString();
  } catch {
    const join = avatarUrl.includes("?") ? "&" : "?";
    return `${avatarUrl}${join}fy=${next.fy}&z=${next.z}`;
  }
}

/** @deprecated use withAvatarFraming */
export function withAvatarFocalY(avatarUrl: string, focalY: number) {
  return withAvatarFraming(avatarUrl, { fy: focalY });
}

export function avatarImageSrc(avatarUrl?: string | null) {
  return avatarUrl?.trim() || null;
}

export function avatarFramingStyle(framing: AvatarFraming): {
  objectPosition: string;
  transform: string;
  transformOrigin: string;
} {
  const scale = framing.z / 100;
  return {
    objectPosition: `50% ${framing.fy}%`,
    transform: scale === 1 ? "none" : `scale(${scale})`,
    transformOrigin: `50% ${framing.fy}%`,
  };
}
