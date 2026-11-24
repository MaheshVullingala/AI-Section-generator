import { VARIANT_DIRECTIONS } from "../catalog";
import { checkSection } from "../check";
import { type CallUsage, complete, designModel, errorMessage, GENERATE_EFFORT, parseRefineResponse, parseSceneResponse, type PromptImage, REFINE_EFFORT } from "../claude";
import { refinePrompt, sectionContext, SYSTEM_PROMPT, variantPrompt } from "../prompts";
import { compileScene } from "../scene/compile";
import type { Scene } from "../scene/types";
import { uid } from "../tokens";
import type { DesignSystem, SectionSpec, Variant } from "../types";

export type VariantResult = { ok: true; variant: Variant } | { ok: false; direction: string; error: string };

const REFERENCE_NOTE = "\n\nReference images are attached above. Borrow their layout ideas, rhythm and interaction cues, but use this design system's tokens, not their colours or fonts.";

/** Generates one structured design for a creative direction. */
export async function generateVariant(
  ds: DesignSystem,
  spec: SectionSpec,
  direction: (typeof VARIANT_DIRECTIONS)[number],
  images: PromptImage[] = [],
  rootClass?: string,
  opts: { premium?: boolean; onUsage?: (u: CallUsage) => void } = {},
): Promise<Variant> {
  // Every variant gets its own root class; the chosen one becomes the section's.
  const id = rootClass ? `${rootClass}-${direction.id}` : uid("sg").replace("_", "-");
  const text = await complete({
    label: `design:${direction.id}`,
    model: designModel("generate", opts.premium),
    effort: GENERATE_EFFORT,
    system: SYSTEM_PROMPT,
    // Identical for all 3 directions, so the 2nd and 3rd designs read it from the cache.
    cachedPrompt: sectionContext(ds, spec) + (images.length ? REFERENCE_NOTE : ""),
    prompt: variantPrompt(direction),
    images,
    cacheImages: true,
    onUsage: opts.onUsage,
  });
  const { name, rationale, scene } = parseSceneResponse(text);
  const code = compileScene(scene, { rootClass: id });
  return { id, direction: direction.label, name, rationale, scene, ...code, issues: checkSection(code, id, spec) };
}

/**
 * Generates designs in parallel, one per creative direction. Pass `only` to
 * generate a single direction, so each design can run in its own request
 * (and its own function time limit when hosted).
 */
export async function generateVariants(
  ds: DesignSystem,
  spec: SectionSpec,
  images: PromptImage[] = [],
  rootClass?: string,
  only?: string,
  opts: { premium?: boolean; onUsage?: (u: CallUsage) => void } = {},
): Promise<VariantResult[]> {
  const directions = only ? VARIANT_DIRECTIONS.filter((d) => d.id === only) : VARIANT_DIRECTIONS;
  if (!directions.length) return [{ ok: false, direction: only ?? "", error: `Unknown design direction "${only}".` }];
  const results = await Promise.allSettled(directions.map((d) => generateVariant(ds, spec, d, images, rootClass, opts)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? { ok: true as const, variant: r.value } : { ok: false as const, direction: directions[i].label, error: errorMessage(r.reason).message },
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
  premium?: boolean;
  onUsage?: (u: CallUsage) => void;
}) {
  const text = await complete({
    label: opts.focusNodeId ? "refine:focused" : "refine",
    model: designModel("refine", opts.premium),
    effort: REFINE_EFFORT,
    system: SYSTEM_PROMPT,
    // The design system and brief repeat on every refinement of this section; the scene and request don't.
    cachedPrompt: sectionContext(opts.ds, opts.spec),
    prompt: refinePrompt(opts.scene, opts.instruction, opts.focusNodeId) + (opts.images?.length ? REFERENCE_NOTE : ""),
    images: opts.images,
    webFetch: opts.webFetch,
    onUsage: opts.onUsage,
  });
  const { rationale, scene, patched } = parseRefineResponse(text, opts.scene);
  console.log(`[claude] refine returned ${patched ? "a patch" : "a full scene"}`);
  const code = compileScene(scene, { rootClass: opts.rootClass });
  return { scene, rationale, ...code, issues: checkSection(code, opts.rootClass, opts.spec) };
}
