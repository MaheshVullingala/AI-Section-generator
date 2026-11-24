/**
 * Pre-generation refinement ("Enhance Prompt"): turns a short or vague request into a
 * structured creative brief without changing what the person asked for.
 *
 * One light Claude call writes the brief; everything else here is deterministic so it can
 * be tested: a prompt quality score, an intent check that the person's own facts survived,
 * and the mapping onto the brief format the design step already uses (see specFromBrief).
 */
import { INTENSITIES, INTERACTIONS, type Intensity } from "../catalog";
import type { Project } from "../types";

export const SECTION_TYPES = [
  "Hero",
  "Features",
  "Pricing",
  "Testimonials",
  "FAQ",
  "Call to action",
  "Product showcase",
  "Comparison table",
  "Stats / metrics",
  "Timeline / process",
  "Team",
  "Gallery",
  "Contact / lead form",
  "Custom",
] as const;

export type RequirementSource = "user" | "project" | "ai";
export interface Requirement {
  text: string;
  /** "user": the person said it. "project": from the project's brand rules. "ai": Claude inferred it. */
  source: RequirementSource;
}

export type SuggestionType = "storytelling" | "interaction" | "layout" | "motion" | "hierarchy" | "mobile" | "content" | "accessibility" | "style";
export interface Suggestion {
  id: string;
  type: SuggestionType;
  description: string;
  status: "suggested" | "accepted" | "rejected";
}

export interface RefinedBrief {
  title: string;
  objective: string;
  audience: string;
  sectionType: string;
  /** The brief as one editable paragraph, shown to the person. */
  summary: string;
  contentRequirements: Requirement[];
  /** Copy the person supplied, verbatim. Empty when Claude should write the copy. */
  copy: string;
  ctas: string;
  creativeDirection: { visualStyle: string; interactionLevel: "low" | "moderate" | "high"; motionLevel: "subtle" | "moderate" | "rich" };
  interactions: string[];
  responsiveRequirements: { desktop: string; mobile: string };
}

/** The validated output of an Enhance Prompt call (section 7 of the refinement spec). */
export interface EnhanceResult {
  schemaVersion: "1.0";
  mode: "pre-generation";
  originalPrompt: string;
  /** false when the prompt was already detailed: the brief mirrors it and there are no suggestions. */
  needsEnhancement: boolean;
  refinedBrief: RefinedBrief;
  suggestions: Suggestion[];
  needsClarification: boolean;
  clarifyingQuestions: string[];
  preserveOriginalIntent: true;
}

export interface PromptQuality {
  /** 0 to 100. */
  score: number;
  words: number;
  /** What the prompt doesn't say yet, in plain words. */
  missing: string[];
  detailed: boolean;
}

export interface IntentCheck {
  /** Numbers, names and quoted phrases from the prompt that the brief dropped. */
  missing: string[];
  /** Figures in the brief that the person never gave (possible invented facts). */
  added: string[];
}

/** What gets stored on the section once the person accepts a brief. */
export interface EnhanceRecord {
  originalPrompt: string;
  result: EnhanceResult;
  intensity: Intensity;
  acceptedAt: number;
}

// ---------------------------------------------------------------------------
// Prompt quality (deterministic)

const SECTION_WORDS = /\b(hero|feature|pricing|plan|testimonial|review|faq|question|cta|call to action|showcase|comparison|compare|stat|metric|number|timeline|process|journey|step|stage|team|gallery|contact|form|banner|header|footer|section|carousel|diagram)/i;
const AUDIENCE_WORDS = /\b(for|audience|users?|customers?|buyers?|visitors?|engineers?|developers?|designers?|executives?|decision[- ]makers?|students?|patients?|teams?|professionals?)\b/i;
const GOAL_WORDS = /\b(explain|show|showcase|convert|sign ?ups?|book|buy|compare|introduce|launch|highlight|educate|demo|drive|encourage|help|so that|goal|purpose)\b/i;
const CONTENT_WORDS = /["“”']|\b(headline|heading|title|copy|text|says?|cta|button|label|bullet|list)\b/i;
const INTERACTION_WORDS = /\b(interactive|click|hover|tap|scroll|animate|animation|motion|tabs?|accordion|carousel|slider|toggle|counter|modal|filter|reveal|transition|parallax|drag)\b/i;
const RESPONSIVE_WORDS = /\b(mobile|tablet|desktop|responsive|breakpoint|phone|small screens?)\b/i;

export function promptQuality(prompt: string): PromptQuality {
  const text = prompt.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const checks: [boolean, string, number][] = [
    [SECTION_WORDS.test(text), "what kind of section it is", 20],
    [GOAL_WORDS.test(text), "what it should achieve", 15],
    [AUDIENCE_WORDS.test(text), "who it's for", 15],
    [CONTENT_WORDS.test(text) || words >= 60, "the content or copy", 15],
    [INTERACTION_WORDS.test(text), "how people interact with it", 15],
    [RESPONSIVE_WORDS.test(text), "how it behaves on mobile", 5],
  ];
  const lengthScore = Math.min(15, Math.round((words / 60) * 15));
  const score = Math.min(100, checks.reduce((n, [ok, , pts]) => n + (ok ? pts : 0), 0) + lengthScore);
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return { score, words, missing, detailed: score >= 75 && words >= 40 };
}

// ---------------------------------------------------------------------------
// Intent preservation (deterministic)

const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/(\d),(?=\d{3}\b)/g, "$1");

/** Capitalised words that start sentences or are too common to be names. */
const COMMON = new Set(["i", "a", "an", "the", "it", "we", "our", "my", "make", "create", "add", "use", "show", "build", "design", "please"]);

/**
 * The parts of a prompt a brief must keep word for word: quoted phrases, numbers,
 * links, acronyms and capitalised names that aren't just the first word of a sentence.
 */
export function protectedTerms(prompt: string): string[] {
  const terms = new Set<string>();
  for (const m of prompt.matchAll(/"([^"]{2,200})"|“([^”]{2,200})”/g)) terms.add((m[1] ?? m[2]).trim());
  for (const m of prompt.matchAll(/https?:\/\/[^\s)]+/g)) terms.add(m[0].replace(/[.,]$/, ""));
  const withoutUrls = prompt.replace(/https?:\/\/[^\s)]+/g, " ");
  for (const m of withoutUrls.matchAll(/[$€£]?\d[\d,.]*(?:\s?%|\+|[kKmMbB]\b|x\b)?/g)) {
    const t = m[0].replace(/[.,]$/, "").trim();
    if (t) terms.add(t);
  }
  for (const m of withoutUrls.matchAll(/(^|[.!?:]\s+|\n\s*)?\b([A-Z][a-zA-Z0-9&-]*[a-zA-Z0-9])\b/g)) {
    const word = m[2];
    const sentenceStart = m[1] !== undefined;
    const acronym = /^[A-Z0-9&-]{2,}$/.test(word);
    if ((sentenceStart && !acronym) || COMMON.has(word.toLowerCase())) continue;
    terms.add(word);
  }
  return [...terms];
}

/** Figures that read as facts (percentages, money, multipliers, big counts), not design values like 44px. */
function factualNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[$€£]?\d[\d,.]*(?:\s?%|\+|[kKmMbB]\b|x\b|\s?(?:px|ms|s|rem|em|vw|vh)\b)?/g)) {
    const raw = m[0].replace(/[.,]$/, "").trim();
    if (/(px|ms|s|rem|em|vw|vh)$/.test(raw)) continue;
    const n = parseFloat(raw.replace(/[^\d.]/g, ""));
    const marked = /[%$€£+]|[kKmMbB]$|x$/.test(raw);
    if (marked || n >= 10) out.add(raw);
  }
  return [...out];
}

function briefText(b: RefinedBrief): string {
  return [b.title, b.objective, b.audience, b.sectionType, b.summary, b.copy, b.ctas, b.creativeDirection.visualStyle, b.responsiveRequirements.desktop, b.responsiveRequirements.mobile, ...b.contentRequirements.map((r) => r.text)].join("\n");
}

/** Checks the brief kept the person's facts and didn't add figures of its own. */
export function checkIntent(originalPrompt: string, brief: RefinedBrief, context = ""): IntentCheck {
  const hay = norm(briefText(brief));
  const missing = protectedTerms(originalPrompt).filter((t) => !hay.includes(norm(t)));
  const known = norm(`${originalPrompt}\n${context}`);
  const added = factualNumbers(`${brief.summary}\n${brief.objective}\n${brief.contentRequirements.filter((r) => r.source !== "user").map((r) => r.text).join("\n")}`).filter(
    (n) => !known.includes(norm(n)),
  );
  return { missing, added };
}

/** Bounded correction: puts dropped terms back as requirements so the designs still get them. */
export function restoreMissing(result: EnhanceResult, missing: string[]): EnhanceResult {
  if (!missing.length) return result;
  const contentRequirements = [...result.refinedBrief.contentRequirements, { text: `Keep exactly as the person wrote: ${missing.map((m) => `"${m}"`).join(", ")}`, source: "user" as const }];
  return { ...result, refinedBrief: { ...result.refinedBrief, contentRequirements } };
}

// ---------------------------------------------------------------------------
// The Claude call

export const ENHANCE_SYSTEM = `You are the creative director inside Forma, a tool an internal team uses to design interactive website sections. Before anything is designed, you turn the person's request into a clear creative brief, the way an experienced designer would restate it back to a client.

Rules:
- Preserve intent. Never change what the section is, who it is for or what it must say. The person's own facts, numbers, names, quoted copy and links appear in the brief exactly as written.
- Do not invent product specifications, performance figures, prices, customer names, statistics or technical facts. If content is missing, say what kind of content is needed ("three customer quotes, supplied by the team") instead of making it up.
- Keep it concise and specific. No generic adjectives like "stunning", "modern", "cutting-edge" unless the person used them.
- Separate what was asked from what you propose. Requirements carry a source: "user" (the person said it), "project" (from the project's brand rules) or "ai" (a sensible inference that follows directly from the request). Creative ideas the person did not ask for go in suggestions, never in requirements.
- Offer 3 to 5 suggestions that would genuinely improve this section (storytelling, a meaningful interaction, layout, subtle motion, hierarchy, mobile, accessibility). Each is one short sentence.
- If the prompt is already detailed (it states the section type, goal, audience and content), set needsEnhancement to false, mirror the prompt faithfully in the brief, and return no suggestions.
- Ask clarifying questions only when the section cannot be designed without the answer (for example, it's unclear what the section is). Never ask about anything the project context already answers.
- Respect the project's brand notes; never propose anything they forbid.

Reply with exactly one <result> tag containing JSON, and nothing else:
<result>{
  "needsEnhancement": true,
  "refinedBrief": {
    "title": "short section name, 2 to 6 words",
    "objective": "one sentence",
    "audience": "who it's for",
    "sectionType": "one of: ${SECTION_TYPES.join(" | ")}",
    "summary": "the refined brief as 2 to 4 sentences, ready to hand to a designer",
    "contentRequirements": [{ "text": "...", "source": "user | project | ai" }],
    "copy": "copy the person supplied, verbatim, or empty",
    "ctas": "CTA labels and targets the person gave, or empty",
    "creativeDirection": { "visualStyle": "2 to 4 words, e.g. technical-editorial", "interactionLevel": "low | moderate | high", "motionLevel": "subtle | moderate | rich" },
    "interactions": ["names from the allowed list"],
    "responsiveRequirements": { "desktop": "...", "mobile": "..." }
  },
  "suggestions": [{ "type": "storytelling | interaction | layout | motion | hierarchy | mobile | content | accessibility | style", "description": "..." }],
  "needsClarification": false,
  "clarifyingQuestions": []
}</result>

Allowed interaction names: ${INTERACTIONS.join(", ")}.`;

export function enhancePrompt(opts: { project: Project; prompt: string; quality: PromptQuality; intensity: Intensity; imageCount?: number; linkCount?: number; avoid?: string[] }): string {
  const { project, prompt, quality, intensity } = opts;
  const level = INTENSITIES.find((i) => i.id === intensity) ?? INTENSITIES[1];
  return `PROJECT CONTEXT (already known; don't ask about it)
- Project: ${project.name}
- Business type: ${project.businessType || "(not set)"}
- Business description: ${project.businessDescription || "(not set)"}
- Design system: ${project.designSystem.name}${project.designSystem.brandNotes ? `\n- Brand notes and rules:\n${project.designSystem.brandNotes}` : ""}
- Accessibility target: ${project.defaults.accessibility}; target CMS: ${project.defaults.targetCms}; JavaScript allowed: ${project.defaults.allowJs ? "yes" : "no"}
- Breakpoints: ${project.designSystem.breakpoints.map((b) => `${b.name} ${b.width}px`).join(", ")}
- Creative intensity chosen: ${level.label} (${level.brief})
${opts.imageCount ? `- The person attached ${opts.imageCount} reference image(s); the designers will see them.\n` : ""}${opts.linkCount ? `- The person shared ${opts.linkCount} reference link(s); the designers will see them.\n` : ""}
PROMPT QUALITY (automatic check): ${quality.score}/100${quality.missing.length ? `; it doesn't yet say ${quality.missing.join(", ")}` : ""}.
${opts.avoid?.length ? `\nThe person asked for different suggestions. Don't repeat these:\n${opts.avoid.map((s) => `- ${s}`).join("\n")}\n` : ""}
THE PERSON'S PROMPT
<prompt>${prompt}</prompt>`;
}

// ---------------------------------------------------------------------------
// Parsing untrusted output

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const SUGGESTION_TYPES: SuggestionType[] = ["storytelling", "interaction", "layout", "motion", "hierarchy", "mobile", "content", "accessibility", "style"];

/** Validates Claude's reply into an EnhanceResult. Unknown fields are dropped, wrong types defaulted. */
export function parseEnhanceResponse(text: string, originalPrompt: string): EnhanceResult {
  const m = text.match(/<result>([\s\S]*?)<\/result>/);
  const body = m ? m[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("Enhance reply had no JSON");
  const raw = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  const rb = (raw.refinedBrief && typeof raw.refinedBrief === "object" ? raw.refinedBrief : {}) as Record<string, unknown>;
  const cd = (rb.creativeDirection && typeof rb.creativeDirection === "object" ? rb.creativeDirection : {}) as Record<string, unknown>;
  const rr = (rb.responsiveRequirements && typeof rb.responsiveRequirements === "object" ? rb.responsiveRequirements : {}) as Record<string, unknown>;
  const reqs = Array.isArray(rb.contentRequirements) ? rb.contentRequirements : [];
  const contentRequirements: Requirement[] = reqs
    .map((r): Requirement | null => {
      if (typeof r === "string") return r.trim() ? { text: r.trim().slice(0, 500), source: "ai" } : null;
      if (!r || typeof r !== "object") return null;
      const t = str((r as Record<string, unknown>).text, 500);
      return t ? { text: t, source: oneOf((r as Record<string, unknown>).source, ["user", "project", "ai"] as const, "ai") } : null;
    })
    .filter((r): r is Requirement => !!r)
    .slice(0, 12);
  const interactions = (Array.isArray(rb.interactions) ? rb.interactions : []).filter((x): x is string => typeof x === "string" && INTERACTIONS.includes(x));
  const needsEnhancement = raw.needsEnhancement !== false;
  const suggestions: Suggestion[] = needsEnhancement
    ? (Array.isArray(raw.suggestions) ? raw.suggestions : [])
        .map((s, i): Suggestion | null => {
          const o = (s && typeof s === "object" ? s : { description: s }) as Record<string, unknown>;
          const description = str(o.description, 300);
          return description ? { id: `suggestion-${i + 1}`, type: oneOf(o.type, SUGGESTION_TYPES, "style"), description, status: "suggested" } : null;
        })
        .filter((s): s is Suggestion => !!s)
        .slice(0, 6)
    : [];
  const questions = (Array.isArray(raw.clarifyingQuestions) ? raw.clarifyingQuestions : []).map((q) => str(q, 300)).filter(Boolean).slice(0, 3);
  const summary = str(rb.summary) || originalPrompt;
  return {
    schemaVersion: "1.0",
    mode: "pre-generation",
    originalPrompt,
    needsEnhancement,
    refinedBrief: {
      title: str(rb.title, 80) || "Untitled section",
      objective: str(rb.objective, 500),
      audience: str(rb.audience, 300),
      sectionType: oneOf(rb.sectionType, SECTION_TYPES, "Custom"),
      summary,
      contentRequirements,
      copy: str(rb.copy, 8000),
      ctas: str(rb.ctas, 500),
      creativeDirection: {
        visualStyle: str(cd.visualStyle, 80),
        interactionLevel: oneOf(cd.interactionLevel, ["low", "moderate", "high"] as const, "moderate"),
        motionLevel: oneOf(cd.motionLevel, ["subtle", "moderate", "rich"] as const, "moderate"),
      },
      interactions,
      responsiveRequirements: { desktop: str(rr.desktop, 300), mobile: str(rr.mobile, 300) },
    },
    suggestions,
    needsClarification: raw.needsClarification === true && questions.length > 0,
    clarifyingQuestions: questions,
    preserveOriginalIntent: true,
  };
}

/**
 * Maps an accepted brief onto the brief format the design step reads (see specFromBrief),
 * so the 3 designs get exactly these requirements. Only accepted suggestions go in.
 */
export function briefFromEnhanced(result: EnhanceResult): Record<string, unknown> {
  const b = result.refinedBrief;
  const accepted = result.suggestions.filter((s) => s.status === "accepted");
  const confirmed = b.contentRequirements.map((r) => `- ${r.text}${r.source === "user" ? " (from the person)" : ""}`);
  const ideas = accepted.filter((s) => s.type !== "interaction" && s.type !== "motion" && s.type !== "layout").map((s) => `- ${s.description}`);
  return {
    title: b.title,
    sectionType: b.sectionType,
    goal: [b.objective, b.summary].filter(Boolean).join("\n"),
    audience: b.audience,
    tone: b.creativeDirection.visualStyle,
    layout: [
      ...accepted.filter((s) => s.type === "layout").map((s) => s.description),
      b.responsiveRequirements.desktop && `Desktop: ${b.responsiveRequirements.desktop}`,
      b.responsiveRequirements.mobile && `Mobile: ${b.responsiveRequirements.mobile}`,
    ]
      .filter(Boolean)
      .join("\n") || "designer's choice",
    copy: b.copy || "Write the copy yourself from the requirements below.",
    copyProvided: !!b.copy,
    ctas: b.ctas,
    images: "",
    interactions: b.interactions,
    interactionNotes: [
      `Interaction level: ${b.creativeDirection.interactionLevel}; motion level: ${b.creativeDirection.motionLevel}.`,
      ...accepted.filter((s) => s.type === "interaction" || s.type === "motion").map((s) => s.description),
    ].join("\n"),
    referenceNotes: "",
    requirements: [
      ...confirmed,
      ...ideas,
      "- Do not invent product specifications, performance claims or technical facts; use clearly marked placeholders where content is missing.",
    ].join("\n"),
  };
}
