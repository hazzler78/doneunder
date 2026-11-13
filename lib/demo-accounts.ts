/** Canonical demo identities for local seed and automated/agent testing. */

export const DEMO_EMAIL_DOMAIN = "demo.doneunder.ai";

export const GARETH_DEMO_USER_ID = "11111111-1111-1111-1111-111111111111";
export const GARETH_DEMO_EMAIL = `gareth@${DEMO_EMAIL_DOMAIN}`;
export const GARETH_DEMO_USERNAME = "gareth-demo";

export const HERMES_DEMO_USER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
export const HERMES_DEMO_EMAIL = `hermes@${DEMO_EMAIL_DOMAIN}`;
export const HERMES_DEMO_USERNAME = "hermes-demo";

export const NORTHARC_DEMO_USER_ID = "99999999-9999-9999-9999-999999999999";
export const NORTHARC_DEMO_EMAIL = `northarc@${DEMO_EMAIL_DOMAIN}`;

/** Deterministic bootstrap password for Hermes demo auth (preview/local only). */
export const HERMES_DEMO_BOOTSTRAP_PASSWORD = "HermesDemo2026!";

export function isDemoEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.endsWith(`@${DEMO_EMAIL_DOMAIN}`) || normalized.includes("+demo@");
}
