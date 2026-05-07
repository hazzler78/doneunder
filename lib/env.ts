const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function checkEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  return { missing, ok: missing.length === 0 };
}
