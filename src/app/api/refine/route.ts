import { complete, errorMessage, parseSection, REFINE_EFFORT, REFINE_MODEL } from "@/lib/claude";
import { refinePrompt, SYSTEM_PROMPT } from "@/lib/prompts";
import type { DesignSystem, SectionCode, SectionSpec } from "@/lib/types";

export const maxDuration = 300;

/** Applies one change request to the current version and returns the full updated section. */
export async function POST(request: Request) {
  const { designSystem, spec, rootClass, current, instruction } = (await request.json()) as {
    designSystem: DesignSystem;
    spec: SectionSpec;
    rootClass: string;
    current: SectionCode;
    instruction: string;
  };
  if (!designSystem || !spec || !current || !instruction?.trim() || !rootClass) {
    return Response.json({ error: "designSystem, spec, rootClass, current and instruction are required" }, { status: 400 });
  }
  try {
    const text = await complete({
      model: REFINE_MODEL,
      effort: REFINE_EFFORT,
      system: SYSTEM_PROMPT,
      prompt: refinePrompt(designSystem, spec, rootClass, current, instruction),
    });
    return Response.json({ section: parseSection(text) });
  } catch (err) {
    const { message, status } = errorMessage(err);
    return Response.json({ error: message }, { status });
  }
}
