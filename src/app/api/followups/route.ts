import { complete, errorMessage, GENERATE_MODEL } from "@/lib/claude";
import { FOLLOWUP_SYSTEM, followupPrompt } from "@/lib/prompts";
import type { SectionSpec } from "@/lib/types";

export const maxDuration = 60;

/** Asks Claude for up to 4 clarifying questions about the brief. */
export async function POST(request: Request) {
  const { spec } = (await request.json()) as { spec: SectionSpec };
  if (!spec) return Response.json({ error: "spec is required" }, { status: 400 });
  try {
    const text = await complete({
      model: GENERATE_MODEL,
      effort: "low",
      system: FOLLOWUP_SYSTEM,
      prompt: followupPrompt(spec),
      maxTokens: 4000,
    });
    const match = text.match(/\[[\s\S]*\]/);
    const parsed: unknown = match ? JSON.parse(match[0]) : [];
    const questions = Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string").slice(0, 4) : [];
    return Response.json({ questions });
  } catch (err) {
    const { message, status } = errorMessage(err);
    return Response.json({ error: message, questions: [] }, { status });
  }
}
