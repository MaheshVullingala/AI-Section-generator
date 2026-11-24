import { errorMessage } from "@/lib/claude";
import type { Scene } from "@/lib/scene/types";
import { authorize } from "@/lib/server/auth";
import { refineDesign } from "@/lib/server/design";
import { checkAllowance, usageRecorder } from "@/lib/server/usage";
import type { DesignSystem, SectionSpec } from "@/lib/types";

export const maxDuration = 300;

/** Applies one change request to the current design, optionally scoped to one element. */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("denied" in auth) return auth.denied;
  const { member } = auth;
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
  const check = await checkAllowance(member);
  if ("denied" in check) return check.denied;
  // The section's root class is its id.
  const usage = usageRecorder(member, { sectionId: rootClass, premium });
  try {
    const result = await refineDesign({ ds: designSystem, spec, rootClass, scene, instruction, focusNodeId, premium, onUsage: usage.onUsage });
    // The editor panel has no chat to answer in, so a clarifying question comes back as the error text.
    if (result.type === "question") return Response.json({ error: result.question, allowance: await usage.flush() }, { status: 422 });
    return Response.json({ ...result, allowance: await usage.flush() });
  } catch (err) {
    const { message, status } = errorMessage(err);
    return Response.json({ error: message, allowance: await usage.flush() }, { status });
  }
}
