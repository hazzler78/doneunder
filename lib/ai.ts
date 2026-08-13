import { xai } from "@ai-sdk/xai";

export const aiModel = xai(process.env.XAI_MODEL ?? "grok-3-mini");

export const AI_DISCLAIMER =
  "AI-generated suggestion. Always verify with certified professionals.";

/** Product language: every user-facing and stored CV/profile string is English. */
export const ENGLISH_ONLY_INSTRUCTION =
  "Always write in English. If the source text is in another language, translate it into clear professional English. Keep proper names, company names, vessel names, and official certificate titles as they appear on the original document.";
