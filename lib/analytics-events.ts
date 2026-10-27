/** Vercel Web Analytics custom event names (no PII in properties). */
export const AnalyticsEvent = {
  DiverSignup: "diver_signup",
  CvUploaded: "cv_uploaded",
  ProfilePublished: "profile_published",
  CompanyProfileRequest: "company_profile_request",
  StripeCheckoutStart: "stripe_checkout_start",
  StripeCheckoutComplete: "stripe_checkout_complete",
  ChatMessage: "chat_message",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type AnalyticsEventProps = Record<string, string | number | boolean | null | undefined>;
