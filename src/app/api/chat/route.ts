import { BRIEF_MODEL, BRIEF_WEB_MODEL, complete, errorMessage, imagesFromDataUrls } from "@/lib/claude";
import { BRIEF_SYSTEM, briefPrompt, specFromBrief } from "@/lib/prompts";
import type { Scene } from "@/lib/scene/types";
import { authorize } from "@/lib/server/auth";
import { generateVariants, refineDesign } from "@/lib/server/design";
import { checkAllowance, usageRecorder } from "@/lib/server/usage";
import type { ChatMessage, Project, Section } from "@/lib/types";

export const maxDuration = 300;

interface ChatRequest {
  project: Project;
  section: Section; // includes the new user message as the last entry
  /** "auto": brief or refine depending on state; "regenerate": 3 designs from the current brief. */
  action?: "auto" | "regenerate";
  /** The design currently shown in the editor (may include unsaved edits). */
  scene?: Scene;
  focusNodeId?: string;
  /** With "regenerate": generate only this design direction (see VARIANT_DIRECTIONS). */
  direction?: string;
  /** Use the premium model (Opus) for designs and refinements. */
  premium?: boolean;
}

function tag(text: string, name: string): string {
  const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : "";
}

function transcript(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const extras = [m.images?.length ? `[${m.images.length} reference image(s)]` : "", m.links?.length ? `[links: ${m.links.join(", ")}]` : ""]
        .filter(Boolean)
        .join(" ");
      const text = m.kind === "variants" ? `${m.text} (3 designs were shown)` : m.text;
      return `${m.role === "user" ? "Person" : "You"}: ${text}${extras ? ` ${extras}` : ""}`;
    })
    .join("\n");
}

/**
 * One chat turn. Before a design is chosen, Claude either asks follow-up questions
 * or writes a brief and generates 3 designs. After a design is chosen, the message
 * is applied as a refinement to the current design.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("denied" in auth) return auth.denied;
  const { member } = auth;
  const body = (await request.json()) as ChatRequest;
  const { project, section, action = "auto", scene, focusNodeId, direction, premium = false } = body;
  if (!project || !section) return Response.json({ error: "project and section are required" }, { status: 400 });
  // Stop before calling Claude if this month's allowance is used up.
  const check = await checkAllowance(member);
  if ("denied" in check) return check.denied;
  const usage = usageRecorder(member, { projectId: project.id, sectionId: section.id, premium });
  // Every reply carries the updated allowance, so the browser can show warnings.
  const reply = async (data: Record<string, unknown>, init?: ResponseInit) => Response.json({ ...data, allowance: await usage.flush() }, init);
  const last = section.messages[section.messages.length - 1];
  // The client strips older images to keep requests small, leaving empty data URLs.
  const userImages = section.messages.filter((m) => m.role === "user").flatMap((m) => (m.images ?? []).filter((i) => i.dataUrl));

  const started = Date.now();
  const log = (step: string) => console.log(`[chat] ${section.id} ${step} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  try {
    // Refine the chosen design. The client sends the current scene only when refining.
    if (action === "auto" && scene && last?.role === "user") {
      const links = last.links ?? [];
      const instruction = [last.text, links.length ? `Reference links (open them with web_fetch if useful): ${links.join(", ")}` : ""].filter(Boolean).join("\n");
      const result = await refineDesign({
        ds: project.designSystem,
        spec: section.spec,
        rootClass: section.id,
        scene,
        instruction,
        focusNodeId,
        images: imagesFromDataUrls((last.images ?? []).map((i) => i.dataUrl)),
        webFetch: links.length > 0,
        premium,
        onUsage: usage.onUsage,
      });
      if (result.type === "question") {
        log("asked which element");
        return reply({ type: "questions", message: result.question, questions: [], edit: result.edit });
      }
      log("refined");
      return reply({ ...result, type: "refined", message: result.rationale || "Done. I've updated the design." });
    }

    // Regenerate from the existing brief.
    if (action === "regenerate" && section.brief) {
      const spec = specFromBrief(project, section.brief, section.spec);
      const variants = await generateVariants(project.designSystem, spec, imagesFromDataUrls(userImages.slice(-4).map((i) => i.dataUrl)), section.id, direction, { premium, onUsage: usage.onUsage });
      log(`designed ${direction ?? "all"} (${variants.filter((v) => v.ok).length}/${variants.length} ok)`);
      for (const v of variants) if (!v.ok) console.error(`[chat] ${section.id} ${v.direction} failed: ${v.error}`);
      if (variants.every((v) => !v.ok)) return reply({ error: (variants[0] as { error: string }).error }, { status: 502 });
      return reply({ type: "variants", message: "", variants, spec });
    }

    if (action === "regenerate") return Response.json({ error: "Describe the section in the chat first." }, { status: 400 });

    // Brief: ask follow-ups, or write the brief.
    const links = section.messages.flatMap((m) => m.links ?? []);
    const text = await complete({
      label: "brief",
      // Haiku writes the brief; a brief that has to open reference links goes to Sonnet.
      model: links.length > 0 ? BRIEF_WEB_MODEL : BRIEF_MODEL,
      effort: "low",
      system: BRIEF_SYSTEM,
      prompt: briefPrompt(project, transcript(section.messages), links),
      images: imagesFromDataUrls(userImages.slice(-4).map((i) => i.dataUrl)),
      webFetch: links.length > 0,
      maxTokens: 16000,
      onUsage: usage.onUsage,
    });
    const message = tag(text, "message") || "Got it.";
    const questionsRaw = tag(text, "questions");
    const briefRaw = tag(text, "brief");
    if (!briefRaw && questionsRaw) {
      let questions: string[] = [];
      try {
        const parsed: unknown = JSON.parse(questionsRaw);
        if (Array.isArray(parsed)) questions = parsed.filter((q): q is string => typeof q === "string").slice(0, 3);
      } catch {
        questions = [questionsRaw];
      }
      log("asked questions");
      return reply({ type: "questions", message, questions });
    }
    if (!briefRaw) throw new Error("Claude didn't return a brief or questions. Try sending your message again.");
    const brief = JSON.parse(briefRaw.slice(briefRaw.indexOf("{"), briefRaw.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const spec = specFromBrief(project, brief, section.spec);
    log("brief written");
    // The client asks for the designs in a second request, so it can show progress.
    return reply({ type: "brief", message, brief, spec, title: typeof brief.title === "string" ? brief.title : undefined });
  } catch (err) {
    const { message, status } = errorMessage(err);
    console.error(`[chat] ${section.id} failed after ${((Date.now() - started) / 1000).toFixed(1)}s:`, err);
    // A call that failed after Claude answered (e.g. an unreadable design) still cost tokens.
    return reply({ error: message }, { status });
  }
}
