export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://doneunder.ai").replace(/\/$/, "");

export const CONTACT_EMAIL = "hello@doneunder.ai";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

export const FEEDBACK_TELEGRAM_URL = "https://t.me/doneunder_feedback";

/** Short product copy: non-English papers are welcome. */
export const MULTILINGUAL_UPLOAD_HINT =
  "Papers in any language are fine — Hermes reads them and saves your living CV in English.";
