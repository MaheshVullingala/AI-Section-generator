import { VARIANT_DIRECTIONS } from "../catalog";
import { checkSection } from "../check";
import { type CallUsage, complete, designModel, errorMessage, GENERATE_EFFORT, parseRefineResponse, parseSceneResponse, type PromptImage, REFINE_EFFORT } from "../claude";
import { refinePrompt, sectionContext, SYSTEM_PROMPT, variantPrompt } from "../prompts";
import { brandWarnings, diffScenes, diffSize, type EditIntent, type EditMeta, minimalPatch, parseEditIntent, type SceneDiff, type ScenePatch, scopeViolations, type ValidationCheck, viewportViolations, viewportWidths } from "../refine/edit";
import { compileScene } from "../scene/compile";
import type { Scene } from "../scene/types";
import { normalizeScene } from "../scene/validate";
import { uid } from "../tokens";
import type { DesignSystem, SectionCode, SectionSpec, Variant } from "../types";

export type VariantResult = { ok: true; variant: Variant } | { ok: false; direction: string; error: string };

const REFERENCE_NOTE = "\n\nReference images are attached above. Borrow their layout ideas, rhythm and interaction cues, but use this design system's tokens, not their colours or fonts.";

/** Generates one structured design for a creative direction. */
export async function generateVariant(
  ds: DesignSystem,
  spec: SectionSpec,
  direction: (typeof VARIANT_DIRECTIONS)[number],
  images: PromptImage[] = [],
  rootClass?: string,
  opts: { premium?: boolean; onUsage?: (u: CallUsage, label: string) => void } = {},
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
  opts: { premium?: boolean; onUsage?: (u: CallUsage, label: string) => void } = {},
): Promise<VariantResult[]> {
  const directions = only ? VARIANT_DIRECTIONS.filter((d) => d.id === only) : VARIANT_DIRECTIONS;
  if (!directions.length) return [{ ok: false, direction: only ?? "", error: `Unknown design direction "${only}".` }];
  const results = await Promise.allSettled(directions.map((d) => generateVariant(ds, spec, d, images, rootClass, opts)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? { ok: true as const, variant: r.value } : { ok: false as const, direction: directions[i].label, error: errorMessage(r.reason).message },
  );
}

export type RefineResult =
  | { type: "question"; question: string; edit: EditIntent; usage: UsageTotal }
  | ({
      type: "refined";
      scene: Scene;
      rationale: string;
      issues: string[];
      edit: EditIntent;
      diff: SceneDiff;
      /** The change as patch nodes, so the client can re-apply it on top of a teammate's newer version. */
      patch: ScenePatch;
      validation: ValidationCheck[];
      model: string;
      usage: UsageTotal;
    } & SectionCode);

export type UsageTotal = NonNullable<EditMeta["usage"]>;

/** How many times a refinement may be retried after it fails a guard (scope, viewports or parsing). */
const MAX_REFINE_ATTEMPTS = 2;

/**
 * Applies one change request to a design, optionally scoped to one element.
 *
 * One Claude call classifies the request (category, scope, viewports, targets) and returns
 * a patch. The patch is applied to the structured scene, then checked deterministically:
 * a selected element's change must stay inside it, a viewport-limited change must leave the
 * other breakpoints identical. A failed check gets one corrective retry; if that fails too,
 * an error is returned and the current design is left untouched.
 */
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
  onUsage?: (u: CallUsage, label: string) => void;
}): Promise<RefineResult> {
  const model = designModel("refine", opts.premium);
  const usage: UsageTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, attempts: 0 };
  const track = (u: CallUsage, label: string) => {
    usage.input += u.input;
    usage.output += u.output;
    usage.cacheRead += u.cacheRead;
    usage.cacheWrite += u.cacheWrite;
    usage.cost = u.cost == null || usage.cost == null ? null : usage.cost + u.cost;
    opts.onUsage?.(u, label);
  };
  // Diff against the normalized form, so key order or defaults don't count as changes.
  const current = normalizeScene(opts.scene);
  let feedback = "";
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_REFINE_ATTEMPTS; attempt++) {
    usage.attempts = attempt;
    const text = await complete({
      label: `${opts.focusNodeId ? "refine:focused" : "refine"}${attempt > 1 ? ":retry" : ""}`,
      model,
      effort: REFINE_EFFORT,
      system: SYSTEM_PROMPT,
      // The design system and brief repeat on every refinement of this section; the scene and request don't.
      cachedPrompt: sectionContext(opts.ds, opts.spec),
      prompt: refinePrompt(current, opts.instruction, opts.focusNodeId) + (opts.images?.length ? REFERENCE_NOTE : "") + feedback,
      images: opts.images,
      webFetch: opts.webFetch,
      onUsage: track,
    });
    const edit = parseEditIntent(text, opts.focusNodeId);
    const question = text.match(/<question>([\s\S]*?)<\/question>/)?.[1].trim();
    if (question && !/<patch>|<scene>/.test(text)) return { type: "question", question, edit, usage };

    let parsed: ReturnType<typeof parseRefineResponse>;
    try {
      parsed = parseRefineResponse(text, current);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      feedback = `\n\nYOUR PREVIOUS ATTEMPT FAILED: ${lastError.message} Reply again in the required format, with node ids that exist in the current scene.`;
      continue;
    }
    const { rationale, scene, patched } = parsed;
    const diff = diffScenes(current, scene);
    const validation: ValidationCheck[] = [{ name: "schema", ok: true, detail: patched ? "patch" : "full scene" }];
    const problems: string[] = [];
    if (opts.focusNodeId) {
      const p = scopeViolations(current, scene, diff, opts.focusNodeId);
      validation.push({ name: "scope", ok: !p.length, detail: p.join("; ") || undefined });
      problems.push(...p);
    }
    const widths = viewportWidths(edit.viewports, opts.spec.breakpoints);
    if (widths) {
      const p = viewportViolations(current, scene, diff, widths, opts.spec.breakpoints);
      validation.push({ name: "viewports", ok: !p.length, detail: p.join("; ") || undefined });
      problems.push(...p);
    }
    if (problems.length) {
      lastError = new Error(
        `I didn't apply that change, because it also ${problems.slice(0, 3).join(", ")}. Try again${opts.focusNodeId ? ', or press "Whole section" to allow changes outside the selected element' : ""}.`,
      );
      feedback = `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED because it ${problems.join("; ")}. Make the change again without touching anything else.`;
      continue;
    }
    if (!diffSize(diff)) {
      lastError = new Error("Claude didn't change anything. Try describing the change differently.");
      feedback = "\n\nYOUR PREVIOUS ATTEMPT CHANGED NOTHING. Make the requested change.";
      continue;
    }
    const brand = brandWarnings(scene, diff, opts.ds);
    validation.push({ name: "brand", ok: !brand.length, detail: brand.join("; ") || undefined });
    const code = compileScene(scene, { rootClass: opts.rootClass });
    const issues = checkSection(code, opts.rootClass, opts.spec);
    validation.push({ name: "quality", ok: !issues.length, detail: issues.length ? `${issues.length} issue(s)` : undefined });
    console.log(
      `[claude] refine ${edit.category}/${edit.scope} viewports=${edit.viewports.join(",")} ${patched ? "patch" : "full scene"}` +
        ` changed=${diff.changed.length} added=${diff.added.length} removed=${diff.removed.length} attempts=${attempt}`,
    );
    return { type: "refined", scene, rationale, ...code, issues, edit, diff, patch: minimalPatch(current, scene, diff), validation, model, usage };
  }
  throw lastError ?? new Error("The change couldn't be applied. Try again.");
}
