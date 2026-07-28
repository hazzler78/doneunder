export function isStripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_149 &&
      process.env.STRIPE_PRICE_199 &&
      process.env.STRIPE_PRICE_249,
  );
}

export function isAiConfigured() {
  return Boolean(process.env.XAI_API_KEY && !isPlaceholderSecret(process.env.XAI_API_KEY));
}

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && anon && !isPlaceholderSecret(url) && !isPlaceholderSecret(anon));
}

function isPlaceholderSecret(value: string) {
  const normalized = value.replace(/^["']|["']$/g, "").trim();
  return (
    !normalized ||
    normalized === "[SENSITIVE]" ||
    normalized.toLowerCase() === "your-key" ||
    normalized.includes("YOUR_")
  );
}
