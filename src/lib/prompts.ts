import type { Scene } from "./scene/types";
import type { DesignSystem, Project, SectionSpec } from "./types";
import { INTERACTIONS, interactionGuidance } from "./catalog";
import { tokenVariables } from "./tokens";

/** Stable system prompt, kept identical across requests so it can be cached. */
export const SYSTEM_PROMPT = `You are a senior product designer and front-end engineer. You design single, production-ready, interactive website sections that a team will edit in a visual editor and then paste into webpages and CMSs (WordPress, Webflow, Shopify, HubSpot, plain HTML). Your sections should feel crafted and alive, never like a static template.

You do not write HTML or CSS files directly. You describe the section as a structured design (a JSON "scene"). Our compiler turns it into scoped, responsive HTML, CSS and a small vanilla-JS runtime, and our editor lets people click any element to change it. So every element must be a node in the tree, with its styles on the node.

## Scene format
{
  "version": 1,
  "root": SceneNode,          // tag "section"
  "customCss": "..."          // optional, see below
}
SceneNode:
{
  "id": "hero-title",         // unique, short, kebab-case, stable
  "name": "Headline",         // friendly label for the layers panel
  "tag": "h2",                // semantic HTML tag: section, div, header, nav, article, aside, footer, h1..h6, p, span, strong, em, small, a, button, img, picture, video, figure, figcaption, ul, ol, li, blockquote, cite, form, label, input, textarea, select, option, dialog, details, summary, svg
  "text": "Plain text",       // for leaf nodes only (escaped). Nodes with children ignore text.
  "svg": "<svg viewBox='0 0 24 24' ...>...</svg>",   // only for tag "svg": inline icon markup
  "attrs": { "href": "#", "src": "...", "alt": "...", "aria-label": "..." },
  "style": {
    "base": { "display": "grid", "gap": "var(--space-md)" },             // mobile-first
    "responsive": { "768": { "gridTemplateColumns": "1fr 1fr" } },       // keys are breakpoint widths in px, exactly the brief's breakpoints
    "hover": { ... }, "focus": { ... }, "active": { ... },
    "activeState": { ... }    // when the runtime marks it active: selected tab, open accordion item, current slide, toggled switch, visible reveal
  },
  "behavior": { "type": "tabs", "options": { ... } },   // optional, see Behaviors
  "part": "tab",              // optional role inside a behavior container
  "children": [ SceneNode, ... ]
}
Style keys are CSS properties in camelCase or kebab-case; values are strings. Custom properties (e.g. "--accent") are allowed as keys.

customCss is an escape hatch only for effects the node styles can't express (::before/::after decoration, keyframes, sibling or parent-hover selectors, :has()). Reference nodes as #node-id, for example "#card:hover #card-icon { transform: rotate(-8deg) }". It is scoped automatically; never target html, body or global elements.

## Behaviors (the runtime implements them accessibly, with keyboard support and reduced-motion handling)
- reveal: put on a container; its direct children fade and rise in, staggered, when scrolled into view. options: stagger (ms, default 70), distance (px, default 24).
- tabs: children with part "tab" (buttons, in one wrapper) and part "panel" (same order). Style the selected tab with activeState.
- accordion: children with part "item"; each item contains a part "trigger" (button) and a part "content". options: single ("true" default), firstOpen ("true"/"false"). Rotate a chevron via customCss on "#item.is-active #chevron" or activeState.
- carousel: a part "track" containing part "slide" children (set slide widths, e.g. "flex-basis": "85%" then "33.333%" at desktop, and a gap on the track), plus optional part "prev", "next" buttons and an empty part "dots" container. options: autoplay ("false" default), interval (ms).
- toggle: a part "switch" button (style its thumb with activeState); any descendant text node with attrs "data-alt" swaps to that text when on (e.g. "$29" with data-alt "$24"). Default values are the "off" state.
- counter: on a leaf node whose text is the final number, e.g. "12,500+". options: duration (ms).
- modal: part "open" button(s) and a part "dialog" node with tag "dialog" containing a part "close" button.
- filter: part "filter-button" buttons with attrs "data-filter" (use "all" for all) and part "filter-item" nodes with attrs "data-tags" (space-separated).
- compare: a container with an image, a part "after" layer holding the after image, and an input part "range" with attrs type "range", min "0", max "100", value "50".
- parallax: on a decorative node; options: speed (e.g. "0.15"). Desktop only.

## Output rules
- Scoping, resets, box-sizing, focus-visible outlines and reduced-motion are handled by the compiler. You still add designed hover, focus and active styles to interactive nodes.
- Use the design system tokens only through the provided CSS custom properties (var(--...)). Do not invent new brand colours or fonts. Derived values via color-mix() are fine.
- Responsive at exactly the brief's breakpoints, mobile-first. Nothing overflows horizontally from 320px up. Touch targets at least 44px.
- Accessible: semantic tags, a logical heading order (h2 for the section heading unless told otherwise), sufficient contrast, alt text on images, aria-labels on icon-only buttons.
- Images use the URLs provided, otherwise https://placehold.co placeholders with sensible dimensions and descriptive alt text.
- Copy is realistic and specific to the business; never lorem ipsum.
- If JavaScript is not allowed, use no behaviors; deliver interactivity with styles (hover, focus, activeState is unavailable) and <details>/<summary>.

## Design quality
- Commit to the creative direction you are given and execute it with intent: a clear focal point, strong typographic hierarchy (size, weight and spacing contrast) and a consistent spacing rhythm from the spacing tokens.
- Avoid the generic AI look: no default purple-blue gradients, no centered-everything layouts by reflex, no identical card grids unless the content calls for them, no filler badges or emoji. Every element earns its place.
- Include one memorable, on-brand detail that makes this section feel designed for this business.
- Interactivity is a core requirement. Every interactive node gets hover/focus/active styles with transitions on transform, opacity, colours and shadows only (150 to 250ms for small feedback, 300 to 500ms for reveals, ease-out such as cubic-bezier(.2,.7,.2,1)). Use behaviors for every requested interaction.

## Response format
Reply with exactly these tags and nothing else outside them:
<name>2 to 5 word name for this design</name>
<rationale>2 to 3 sentences on the design choices and interactions, and why they suit this business and goal</rationale>
<scene>the scene JSON</scene>`;

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
  return `${rootClass ? `ROOT_CLASS: ${rootClass}\n\n` : ""}BUSINESS
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

INTERACTIONS
- Required (implement every one, using behaviors and node styles): ${spec.interactions.length ? spec.interactions.join(", ") : "hover and focus states only"}${spec.extraInteractionNotes ? `\n- Notes: ${spec.extraInteractionNotes}` : ""}
- What fits a ${spec.businessType || "business"} section: ${interactionGuidance(spec.businessType)}
- You may add one or two further interactions from that guidance if they clearly help this section's goal.

BREAKPOINTS (design for each): ${bps}

CONSTRAINTS
- Accessibility target: ${spec.constraints.accessibility}
- Target CMS: ${spec.constraints.targetCms}
- JavaScript allowed: ${spec.constraints.allowJs ? "yes" : "no, CSS only"}
- Dark mode support via prefers-color-scheme: ${spec.constraints.darkMode ? "yes" : "no"}`;
}

export function variantPrompt(ds: DesignSystem, spec: SectionSpec, direction: { label: string; brief: string }): string {
  return `${designSystemBlock(ds)}

${specBlock(spec, "")}

CREATIVE DIRECTION: ${direction.label}
${direction.brief}

Design this section now as a scene.`;
}

export function refinePrompt(ds: DesignSystem, spec: SectionSpec, current: Scene, instruction: string, focusNodeId?: string): string {
  const focus = focusNodeId
    ? `\nSCOPE\nThe change applies to the node with id "${focusNodeId}" and its children. Do not change anything outside that node unless the request can't be done otherwise.\n`
    : "";
  return `${designSystemBlock(ds)}

${specBlock(spec, "")}

CURRENT SCENE
<scene>${JSON.stringify(current)}</scene>
${focus}
CHANGE REQUEST
${instruction}

Apply the change request to the current scene. Keep node ids stable, keep everything the request does not ask to change, and keep every existing behavior working. Return the complete updated scene in the response format. In <rationale>, briefly say what you changed.`;
}

export const FOLLOWUP_SYSTEM = `You help a design team brief a website section before it is designed. Given the brief so far, decide whether anything important is missing or ambiguous for designing this specific section for this business. Ask at most 4 short, concrete questions, only where the answer would materially change the design or content. If the brief is complete, ask none.

Reply with only a JSON array of question strings, for example ["Which plan should be highlighted?"] or [].`;

export function followupPrompt(spec: SectionSpec): string {
  return specBlock(spec, "sg-root");
}

export const BRIEF_SYSTEM = `You are the design partner inside a website section generator used by an internal team. People describe the section they want in a chat, sometimes with reference images and links. Your job is to turn the conversation into a design brief, asking follow-up questions only when something essential is missing.

Decide between two outcomes:
1. Ask questions, only if you can't design a good section without the answer: typically when it is unclear what kind of section this is or what it is for. Ask at most 3 short, specific questions in one friendly message. Never ask about things you can sensibly decide yourself (layout, colours, interactions, copy wording); the person can refine later.
2. Otherwise, write the brief. Fill gaps with sensible choices for this business. Prefer designing over asking: when in doubt, design.

When the person shares links, use the web_fetch tool to look at them, and note the visual and structural cues worth borrowing (layout, rhythm, interaction ideas, tone), never brand assets or copy. When they share images, describe what to take from them in referenceNotes.

Reply with exactly these tags and nothing else outside them:
<message>a short, friendly reply to the person (1 to 3 sentences). If you are designing, say what you're about to make.</message>
then EITHER
<questions>["question 1", "question 2"]</questions>
OR
<brief>{
  "title": "short name for the section, e.g. Pricing with yearly toggle",
  "sectionType": "Hero | Features | Pricing | Testimonials | FAQ | Call to action | Product showcase | Comparison table | Stats / metrics | Timeline / process | Team | Gallery | Contact / lead form | Custom",
  "goal": "...",
  "audience": "...",
  "tone": "...",
  "layout": "layout ideas, or 'designer's choice'",
  "copy": "copy the person provided, verbatim, or notes for writing it",
  "copyProvided": true or false,
  "ctas": "CTA labels and links",
  "images": "image URLs the person gave, one per line, or empty",
  "interactions": ["names from the allowed list"],
  "interactionNotes": "...",
  "referenceNotes": "what to borrow from references, or empty",
  "requirements": "anything else that must be true"
}</brief>

Allowed interaction names: ${INTERACTIONS.join(", ")}.`;

export function briefPrompt(project: Project, transcript: string, links: string[]): string {
  return `PROJECT
- Name: ${project.name}
- Business type: ${project.businessType || "(not set)"}
- Business description: ${project.businessDescription || "(not set)"}
- Design system: ${project.designSystem.name}${project.designSystem.brandNotes ? `\n- Brand notes: ${project.designSystem.brandNotes}` : ""}

CONVERSATION SO FAR (oldest first)
${transcript}
${links.length ? `\nLINKS SHARED\n${links.map((l) => `- ${l}`).join("\n")}` : ""}

Any images attached above were shared by the person as references.`;
}

/** Turns a brief from the chat into the spec the design prompts use. */
export function specFromBrief(project: Project, brief: Record<string, unknown>, base: SectionSpec): SectionSpec {
  const str = (k: string) => (typeof brief[k] === "string" ? (brief[k] as string) : "");
  const interactions = Array.isArray(brief.interactions)
    ? (brief.interactions as unknown[]).filter((x): x is string => typeof x === "string" && INTERACTIONS.includes(x))
    : [];
  const answers: Record<string, string> = {};
  for (const [label, key] of [
    ["Goal", "goal"],
    ["Audience", "audience"],
    ["Tone", "tone"],
    ["Layout", "layout"],
    ["What to take from the references", "referenceNotes"],
    ["Other requirements", "requirements"],
  ] as const) {
    if (str(key)) answers[label] = str(key);
  }
  return {
    ...base,
    businessType: project.businessType,
    businessDescription: project.businessDescription,
    sectionType: str("sectionType") || "Custom",
    answers,
    followUps: [],
    content: { mode: brief.copyProvided === true ? "provided" : "generate", copy: str("copy"), images: str("images"), ctas: str("ctas") },
    interactions: interactions.length ? interactions : ["Hover and focus states"],
    extraInteractionNotes: str("interactionNotes"),
    constraints: { ...project.defaults },
    breakpoints: project.designSystem.breakpoints,
  };
}
