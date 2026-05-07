import { xai } from "@ai-sdk/xai";

export const aiModel = xai(process.env.XAI_MODEL ?? "grok-3-mini");

export const AI_DISCLAIMER =
  "AI-generated suggestion. Always verify with certified professionals.";
