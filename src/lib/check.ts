import type { SectionCode, SectionSpec } from "./types";

/** Markers that show a requested interaction was actually built (only checked when JS is allowed, unless noted). */
const INTERACTION_MARKERS: Record<string, { test: RegExp; where: "html" | "css" | "js" | "any"; cssOnlyOk?: boolean }> = {
  Tabs: { test: /role=["']tablist["']/, where: "html", cssOnlyOk: false },
  Accordion: { test: /aria-expanded|<details/, where: "html", cssOnlyOk: true },
  "Carousel / slider": { test: /scroll-snap-type/, where: "css", cssOnlyOk: true },
  "Toggle (e.g. monthly / yearly)": { test: /aria-pressed|role=["']switch["']|aria-checked/, where: "html" },
  "Animated counters": { test: /requestAnimationFrame/, where: "js" },
  "Scroll reveal animations": { test: /IntersectionObserver|animation-timeline/, where: "any", cssOnlyOk: true },
  "Modal / lightbox": { test: /<dialog/, where: "html" },
  "Before / after comparison": { test: /type=["']range["']/, where: "html", cssOnlyOk: true },
  "Filterable grid": { test: /aria-pressed|aria-live/, where: "html" },
};

/** Splits a selector list on commas that aren't inside parentheses, e.g. ":where(h1,h2)". */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Interaction name -> behavior type, for code compiled from a structured design. */
const INTERACTION_BEHAVIOR: Record<string, string> = {
  Tabs: "tabs",
  Accordion: "accordion",
  "Carousel / slider": "carousel",
  "Toggle (e.g. monthly / yearly)": "toggle",
  "Animated counters": "counter",
  "Scroll reveal animations": "reveal",
  "Modal / lightbox": "modal",
  "Filterable grid": "filter",
  "Before / after comparison": "compare",
  "Parallax / depth": "parallax",
};

function unscopedSelectors(css: string, rootClass: string): string[] {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // drop keyframe bodies, whose "selectors" are percentages
    .replace(/@(-webkit-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const bad: string[] = [];
  const re = /([^{}]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@")) continue;
    for (const sel of splitTopLevel(prelude)) {
      const s = sel.trim();
      if (s && !s.startsWith(`.${rootClass}`)) bad.push(s);
    }
  }
  return bad;
}

/** Cheap static checks on generated code. Returns human-readable issues; empty means nothing found. */
export function checkSection(code: SectionCode, rootClass: string, spec: SectionSpec): string[] {
  const issues: string[] = [];
  const all = `${code.html}\n${code.css}\n${code.js}`;

  if (!new RegExp(`class=["'][^"']*\\b${rootClass}\\b`).test(code.html)) {
    issues.push(`The root element is missing the scoping class "${rootClass}".`);
  }
  const bad = unscopedSelectors(code.css, rootClass);
  if (bad.length) {
    issues.push(`Some CSS selectors are not scoped to .${rootClass} and could affect the host page: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`);
  }
  if (/transition|animation/.test(code.css) && !/prefers-reduced-motion/.test(code.css + code.js)) {
    issues.push("Animations and transitions are not reduced under prefers-reduced-motion.");
  }
  if (/<(button|a\s|input|select|textarea)/.test(code.html) && !/:focus-visible|:focus\b/.test(code.css)) {
    issues.push("Interactive elements have no visible focus style.");
  }
  if (code.js.trim()) {
    if (!spec.constraints.allowJs) issues.push("JavaScript was included although the brief asked for CSS only.");
    else if (!code.js.includes(rootClass)) issues.push("The JavaScript does not scope itself to the section's root class.");
  }
  if (/lorem ipsum/i.test(all)) issues.push("The section contains lorem ipsum placeholder text.");

  const fromScene = /data-sg-(behavior|part)=/.test(code.html);
  for (const interaction of spec.interactions) {
    if (fromScene) {
      const type = INTERACTION_BEHAVIOR[interaction];
      const builtWithCss = interaction === "Accordion" && /<details/.test(code.html);
      if (type && !code.html.includes(`data-sg-behavior="${type}"`) && !builtWithCss && spec.constraints.allowJs) {
        issues.push(`The requested "${interaction}" interaction doesn't appear to be implemented.`);
      }
      continue;
    }
    const marker = INTERACTION_MARKERS[interaction];
    if (!marker) continue;
    if (!spec.constraints.allowJs && !marker.cssOnlyOk) continue;
    const haystack = marker.where === "any" ? all : code[marker.where];
    if (!marker.test.test(haystack)) issues.push(`The requested "${interaction}" interaction doesn't appear to be implemented.`);
  }
  return issues;
}

export function fixIssuesInstruction(issues: string[]): string {
  return `Fix these issues without changing the design otherwise:\n${issues.map((i) => `- ${i}`).join("\n")}`;
}
