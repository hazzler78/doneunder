import { generateObject } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiModel, AI_DISCLAIMER } from "@/lib/ai";
import { logAiInteraction } from "@/lib/audit";
import { isAiConfigured } from "@/lib/feature-flags";

const requestSchema = z.object({
  feature: z.enum([
    "cv_builder",
    "ambassador_optimizer",
    "qualification_gap_analyzer",
    "smart_job_poster",
    "candidate_screener",
  ]),
  input: z.string().min(10),
  actorId: z.string().optional(),
});

const outputSchema = z.object({
  title: z.string(),
  content: z.string(),
  bullets: z.array(z.string()),
  disclaimer: z.string(),
});

export async function POST(req: Request) {
  try {
    if (!isAiConfigured()) {
      return NextResponse.json(
        {
          error: "AI is temporarily unavailable. Configure XAI_API_KEY to enable this feature.",
          disclaimer: AI_DISCLAIMER,
        },
        { status: 503 },
      );
    }

    const body = requestSchema.parse(await req.json());
    const systemPrompt =
      "You are an AI assistant specialized in commercial diving recruitment, offshore operations, IMCA/ADCI certifications, saturation hours, and marine project staffing. Keep language concrete, compliant, and safety-first.";

    const result = await generateObject({
      model: aiModel,
      schema: outputSchema,
      prompt: `${systemPrompt}\nFeature: ${body.feature}\nInput: ${body.input}\nAlways include practical, verifiable outputs.`,
    });

    const response = { ...result.object, disclaimer: AI_DISCLAIMER };
    await logAiInteraction({
      actor_id: body.actorId ?? null,
      feature: body.feature,
      input: body.input,
      output: response,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process AI request", detail: String(error) },
      { status: 400 },
    );
  }
}
