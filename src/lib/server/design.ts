import { VARIANT_DIRECTIONS } from "../catalog";
import { checkSection } from "../check";
import { complete, errorMessage, GENERATE_EFFORT, GENERATE_MODEL, parseSceneResponse, type PromptImage, REFINE_EFFORT, REFINE_MODEL } from "../claude";
import { refinePrompt, SYSTEM_PROMPT, variantPrompt } from "../prompts";
import { compileScene } from "../scene/compile";
import type { Scene } from "../scene/types";
import { uid } from "../tokens";
import type { DesignSystem, SectionSpec, Variant } from "../types";

export type VariantResult = { ok: true; variant: Variant } | { ok: false; direction: string; error: string };

const REFERENCE_NOTE = "\n\nReference images are attached above. Borrow their layout ideas, rhythm and interaction cues, but use this design system's tokens, not their colours or fonts.";

/** Generates 3 structured designs in parallel, one per creative direction. */
export async function generateVariants(ds: DesignSystem, spec: SectionSpec, images: PromptImage[] = [], rootClass?: string): Promise<VariantResult[]> {
  const results = await Promise.allSettled(
    VARIANT_DIRECTIONS.map(async (direction): Promise<Variant> => {
      // Every variant gets its own root class; the chosen one becomes the section's.
      const id = rootClass ? `${rootClass}-${direction.id}` : uid("sg").replace("_", "-");
      const text = await complete({
        model: GENERATE_MODEL,
        effort: GENERATE_EFFORT,
        system: SYSTEM_PROMPT,
        prompt: variantPrompt(ds, spec, direction) + (images.length ? REFERENCE_NOTE : ""),
        images,
      });
      const { name, rationale, scene } = parseSceneResponse(text);
      const code = compileScene(scene, { rootClass: id });
      return { id, direction: direction.label, name, rationale, scene, ...code, issues: checkSection(code, id, spec) };
    }),
  );
  return results.map((r, i) =>
    r.status === "fulfilled" ? { ok: true as const, variant: r.value } : { ok: false as const, direction: VARIANT_DIRECTIONS[i].label, error: errorMessage(r.reason).message },
  );
}

/** Applies one change request to a design, optionally scoped to one element. */
export async function refineDesign(opts: {
  ds: DesignSystem;
  spec: SectionSpec;
  rootClass: string;
  scene: Scene;
  instruction: string;
  focusNodeId?: string;
  images?: PromptImage[];
  webFetch?: boolean;
}) {
  const text = await complete({
    model: REFINE_MODEL,
    effort: REFINE_EFFORT,
    system: SYSTEM_PROMPT,
    prompt: refinePrompt(opts.ds, opts.spec, opts.scene, opts.instruction, opts.focusNodeId) + (opts.images?.length ? REFERENCE_NOTE : ""),
    images: opts.images,
    webFetch: opts.webFetch,
  });
  const { rationale, scene } = parseSceneResponse(text);
  const code = compileScene(scene, { rootClass: opts.rootClass });
  return { scene, rationale, ...code, issues: checkSection(code, opts.rootClass, opts.spec) };
}
