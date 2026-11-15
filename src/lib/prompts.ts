import type { DesignSystem, SectionCode, SectionSpec } from "./types";
import { tokenVariables } from "./tokens";

/** Stable system prompt, kept identical across requests so it can be cached. */
export const SYSTEM_PROMPT = `You are a senior product designer and front-end engineer. You design and build single, production-ready website sections that a team will paste into existing webpages and CMSs (WordPress, Webflow, Shopify, HubSpot, plain HTML).

Output contract. Every section you produce must:
- Be self-contained: one root <section> element plus its CSS and optional vanilla JavaScript. No frameworks, no build step, no external JS libraries, no external CSS frameworks. Icons are inline SVG.
- Be scoped so it cannot leak into or be broken by the host page: the root <section> carries the class given as ROOT_CLASS, and every CSS selector starts with .ROOT_CLASS. Reset box-sizing and margins inside the section only.
- Use the design system tokens only through the provided CSS custom properties (var(--...)). Do not invent new brand colours or fonts. Derived values (tints, transparency) are allowed via color-mix().
- Be responsive at exactly the breakpoints given, written mobile-first with min-width media queries at those pixel values. Nothing may overflow horizontally at any width from 320px up.
- Be accessible: semantic HTML, a logical heading order (use h2 for the section heading unless told otherwise), visible focus styles, sufficient colour contrast, keyboard operable interactions, correct ARIA on tabs/accordions/carousels, alt text on images, and all motion disabled under prefers-reduced-motion.
- JavaScript (when allowed) runs in an IIFE, queries elements only inside its own root (document.querySelectorAll('.ROOT_CLASS') then scope within each), supports multiple instances on a page, and degrades gracefully if it never runs.
- Images use the URLs provided, otherwise https://placehold.co placeholders with sensible dimensions and descriptive alt text.
- Copy is realistic and specific to the business; never lorem ipsum.

Response format. Reply with exactly these tags and nothing else outside them:
<name>2 to 5 word name for this design</name>
<rationale>2 to 3 sentences on the design choices and why they suit this business and goal</rationale>
<html>the section markup</html>
<css>the CSS, without <style> tags</css>
<js>the JavaScript, without <script> tags, or empty if none is needed</js>`;

function list(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
}

export function designSystemBlock(ds: DesignSystem): string {
  const vars = tokenVariables(ds);
  return `DESIGN SYSTEM: ${ds.name}
Available CSS custom properties (already defined by the host page; use them with var()):
${list(vars) || "  (none provided: choose a restrained neutral palette and define your own variables on the root)"}
${ds.brandNotes ? `\nBrand notes and rules:\n${ds.brandNotes}` : ""}`;
}

export function specBlock(spec: SectionSpec, rootClass: string): string {
  const answers = Object.entries(spec.answers)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const followUps = spec.followUps
    .filter((f) => f.answer.trim())
    .map((f) => `- ${f.question}: ${f.answer}`)
    .join("\n");
  const bps = [...spec.breakpoints].sort((a, b) => a.width - b.width).map((b) => `${b.name} ${b.width}px`).join(", ");
  return `ROOT_CLASS: ${rootClass}

BUSINESS
- Type: ${spec.businessType}
- Description: ${spec.businessDescription || "(not given)"}

SECTION
- Type: ${spec.sectionType}
${answers}
${followUps ? `\nClarifications\n${followUps}` : ""}

CONTENT
- ${spec.content.mode === "provided" ? "Use this copy as written (you may structure it):" : "Write the copy yourself. Notes:"}
${spec.content.copy || "(none)"}
- Images: ${spec.content.images || "use placeholders"}
- CTAs and links: ${spec.content.ctas || "choose sensible ones, link to #"}

INTERACTIONS: ${spec.interactions.length ? spec.interactions.join(", ") : "subtle hover/focus only"}${spec.extraInteractionNotes ? `\nNotes: ${spec.extraInteractionNotes}` : ""}

BREAKPOINTS (design for each): ${bps}

CONSTRAINTS
- Accessibility target: ${spec.constraints.accessibility}
- Target CMS: ${spec.constraints.targetCms}
- JavaScript allowed: ${spec.constraints.allowJs ? "yes" : "no, CSS only"}
- Dark mode support via prefers-color-scheme: ${spec.constraints.darkMode ? "yes" : "no"}`;
}

export function variantPrompt(ds: DesignSystem, spec: SectionSpec, rootClass: string, direction: { label: string; brief: string }): string {
  return `${designSystemBlock(ds)}

${specBlock(spec, rootClass)}

CREATIVE DIRECTION: ${direction.label}
${direction.brief}

Design and build this section now.`;
}

export function refinePrompt(ds: DesignSystem, spec: SectionSpec, rootClass: string, current: SectionCode, instruction: string): string {
  return `${designSystemBlock(ds)}

${specBlock(spec, rootClass)}

CURRENT SECTION
<html>${current.html}</html>
<css>${current.css}</css>
<js>${current.js}</js>

CHANGE REQUEST
${instruction}

Apply the change request to the current section. Keep everything that the request does not ask to change, keep ROOT_CLASS and the output contract, and return the complete updated section in the response format. In <rationale>, briefly say what you changed.`;
}

export const FOLLOWUP_SYSTEM = `You help a design team brief a website section before it is designed. Given the brief so far, decide whether anything important is missing or ambiguous for designing this specific section for this business. Ask at most 4 short, concrete questions, only where the answer would materially change the design or content. If the brief is complete, ask none.

Reply with only a JSON array of question strings, for example ["Which plan should be highlighted?"] or [].`;

export function followupPrompt(spec: SectionSpec): string {
  return specBlock(spec, "sg-root");
}
