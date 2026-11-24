import { type CallUsage, complete, ENHANCE_MODEL, errorMessage } from "@/lib/claude";
import { checkAllowance, usageRecorder } from "@/lib/server/usage";
import { isIntensity } from "@/lib/catalog";
import { checkIntent, ENHANCE_SYSTEM, enhancePrompt, parseEnhanceResponse, promptQuality, restoreMissing } from "@/lib/refine/brief";
import { authorize } from "@/lib/server/auth";
import type { Project } from "@/lib/types";

export const maxDuration = 60;

interface EnhanceRequest {
  project: Project;
  prompt: string;
  intensity?: string;
  imageCount?: number;
  linkCount?: number;
  /** Suggestions from the last attempt, when the person asks for different ones. */
  avoid?: string[];
}

/**
 * Enhance Prompt: turns the person's first message into a structured creative brief.
 * Reference images and links are not sent here (they go to the designers as before),
 * so this stays a small, cheap call.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json()) as EnhanceRequest;
  const prompt = body.prompt?.trim();
  if (!body.project || !prompt) return Response.json({ error: "project and prompt are required" }, { status: 400 });
  if (prompt.length > 20_000) return Response.json({ error: "That prompt is too long to enhance. Shorten it, or generate without enhancing." }, { status: 413 });
  const intensity = isIntensity(body.intensity) ? body.intensity : "balanced";
  const quality = promptQuality(prompt);
  const check = await checkAllowance(auth.member);
  if ("denied" in check) return check.denied;
  const recorder = usageRecorder(auth.member, { projectId: body.project.id });
  const calls: CallUsage[] = [];
  try {
    const text = await complete({
      label: "enhance",
      model: ENHANCE_MODEL,
      effort: "low",
      system: ENHANCE_SYSTEM,
      prompt: enhancePrompt({
        project: body.project,
        prompt,
        quality,
        intensity,
        imageCount: body.imageCount,
        linkCount: body.linkCount,
        avoid: Array.isArray(body.avoid) ? body.avoid.filter((s) => typeof s === "string").slice(0, 8) : undefined,
      }),
      maxTokens: 4000,
      onUsage: (u, label) => {
        calls.push(u);
        recorder.onUsage(u, label);
      },
    });
    const parsed = parseEnhanceResponse(text, prompt);
    const context = [body.project.businessDescription, body.project.designSystem?.brandNotes].filter(Boolean).join("\n");
    const intent = checkIntent(prompt, parsed.refinedBrief, context);
    // Bounded correction: anything the brief dropped is put back word for word.
    const result = restoreMissing(parsed, intent.missing);
    const usage = calls.reduce(
      (t, u) => ({ input: t.input + u.input, output: t.output + u.output, cost: u.cost == null || t.cost == null ? null : t.cost + u.cost }),
      { input: 0, output: 0, cost: 0 as number | null },
    );
    return Response.json({ result, quality, intent, usage, allowance: await recorder.flush() });
  } catch (err) {
    const { message, status } = errorMessage(err);
    console.error("[enhance] failed:", err);
    return Response.json({ error: message, allowance: await recorder.flush() }, { status });
  }
}
