import { checkSection } from "@/lib/check";
import { complete, errorMessage, parseSceneResponse, REFINE_EFFORT, REFINE_MODEL } from "@/lib/claude";
import { refinePrompt, SYSTEM_PROMPT } from "@/lib/prompts";
import { compileScene } from "@/lib/scene/compile";
import type { Scene } from "@/lib/scene/types";
import type { DesignSystem, SectionSpec } from "@/lib/types";

export const maxDuration = 300;

/** Applies one change request to the current design, optionally scoped to one element. */
export async function POST(request: Request) {
  const { designSystem, spec, rootClass, scene, instruction, focusNodeId } = (await request.json()) as {
    designSystem: DesignSystem;
    spec: SectionSpec;
    rootClass: string;
    scene: Scene;
    instruction: string;
    focusNodeId?: string;
  };
  if (!designSystem || !spec || !scene || !instruction?.trim() || !rootClass) {
    return Response.json({ error: "designSystem, spec, rootClass, scene and instruction are required" }, { status: 400 });
  }
  try {
    const text = await complete({
      model: REFINE_MODEL,
      effort: REFINE_EFFORT,
      system: SYSTEM_PROMPT,
      prompt: refinePrompt(designSystem, spec, scene, instruction, focusNodeId),
    });
    const { rationale, scene: next } = parseSceneResponse(text);
    const code = compileScene(next, { rootClass });
    return Response.json({ scene: next, rationale, ...code, issues: checkSection(code, rootClass, spec) });
  } catch (err) {
    const { message, status } = errorMessage(err);
    return Response.json({ error: message }, { status });
  }
}
