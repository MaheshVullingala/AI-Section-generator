import { errorMessage } from "@/lib/claude";
import type { Scene } from "@/lib/scene/types";
import { requireMember } from "@/lib/server/auth";
import { refineDesign } from "@/lib/server/design";
import type { DesignSystem, SectionSpec } from "@/lib/types";

export const maxDuration = 300;

/** Applies one change request to the current design, optionally scoped to one element. */
export async function POST(request: Request) {
  const denied = await requireMember(request);
  if (denied) return denied;
  const { designSystem, spec, rootClass, scene, instruction, focusNodeId, premium } = (await request.json()) as {
    designSystem: DesignSystem;
    spec: SectionSpec;
    rootClass: string;
    scene: Scene;
    instruction: string;
    focusNodeId?: string;
    premium?: boolean;
  };
  if (!designSystem || !spec || !scene || !instruction?.trim() || !rootClass) {
    return Response.json({ error: "designSystem, spec, rootClass, scene and instruction are required" }, { status: 400 });
  }
  try {
    return Response.json(await refineDesign({ ds: designSystem, spec, rootClass, scene, instruction, focusNodeId, premium }));
  } catch (err) {
    const { message, status } = errorMessage(err);
    return Response.json({ error: message }, { status });
  }
}
