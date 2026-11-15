import { VARIANT_DIRECTIONS } from "@/lib/catalog";
import { complete, errorMessage, GENERATE_EFFORT, GENERATE_MODEL, parseSection } from "@/lib/claude";
import { SYSTEM_PROMPT, variantPrompt } from "@/lib/prompts";
import { uid } from "@/lib/tokens";
import type { DesignSystem, SectionSpec, Variant } from "@/lib/types";

export const maxDuration = 300;

/** Generates 3 variants in parallel, one per creative direction. */
export async function POST(request: Request) {
  const { designSystem, spec } = (await request.json()) as { designSystem: DesignSystem; spec: SectionSpec };
  if (!designSystem || !spec) return Response.json({ error: "designSystem and spec are required" }, { status: 400 });

  const results = await Promise.allSettled(
    VARIANT_DIRECTIONS.map(async (direction): Promise<Variant> => {
      const rootClass = uid("sg").replace("_", "-");
      const text = await complete({
        model: GENERATE_MODEL,
        effort: GENERATE_EFFORT,
        system: SYSTEM_PROMPT,
        prompt: variantPrompt(designSystem, spec, rootClass, direction),
      });
      return { id: rootClass, direction: direction.label, ...parseSection(text) };
    }),
  );

  const variants = results.map((r, i) =>
    r.status === "fulfilled"
      ? { ok: true as const, variant: r.value }
      : { ok: false as const, direction: VARIANT_DIRECTIONS[i].label, error: errorMessage(r.reason).message },
  );
  if (variants.every((v) => !v.ok)) {
    const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    const { message, status } = errorMessage(first.reason);
    return Response.json({ error: message, variants }, { status });
  }
  return Response.json({ variants });
}
