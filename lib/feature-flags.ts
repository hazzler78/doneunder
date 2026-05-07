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
  return Boolean(process.env.XAI_API_KEY);
}
