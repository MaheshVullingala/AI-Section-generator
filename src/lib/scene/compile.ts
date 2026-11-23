import type { SectionCode } from "../types";
import { runtimeJs } from "./runtime";
import type { NodeStyle, Scene, SceneNode, StyleProps } from "./types";

const VOID = new Set(["img", "input", "br", "hr", "source", "meta", "link", "area", "col", "embed", "track", "wbr"]);
const ALLOWED_TAG = /^[a-z][a-z0-9-]*$/;
const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "link", "meta", "base", "html", "head", "body"]);

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kebab = (k: string) => (k.startsWith("--") ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
const cleanValue = (v: string) => String(v).replace(/[{}]/g, "").replace(/;/g, "").replace(/<\/?style/gi, "").trim();
const cleanId = (id: string) => String(id).replace(/[^a-zA-Z0-9_-]/g, "-");

export function nodeClass(id: string) {
  return `n-${cleanId(id)}`;
}

function decls(props?: StyleProps): string {
  if (!props) return "";
  return Object.entries(props)
    .filter(([k, v]) => k && v != null && String(v).trim() !== "" && /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/.test(k))
    .map(([k, v]) => `${kebab(k)}:${cleanValue(v)}`)
    .join(";");
}

interface CompileOptions {
  rootClass: string;
  /** Adds data-sg-id to every element so the editor can select it. */
  editor?: boolean;
}

/** Walks the tree in document order. */
export function walk(node: SceneNode, fn: (n: SceneNode, parent: SceneNode | null, depth: number) => void, parent: SceneNode | null = null, depth = 0) {
  fn(node, parent, depth);
  node.children?.forEach((c) => walk(c, fn, node, depth + 1));
}

function selectorFor(node: SceneNode, root: SceneNode, rootClass: string) {
  return node === root ? `.${rootClass}` : `.${rootClass} .${nodeClass(node.id)}`;
}

function nodeCss(node: SceneNode, root: SceneNode, rootClass: string, out: { base: string[]; media: Map<number, string[]> }) {
  const st: NodeStyle = node.style ?? {};
  const sel = selectorFor(node, root, rootClass);
  const push = (s: string, d: string) => d && out.base.push(`${s}{${d}}`);
  push(sel, decls(st.base));
  if (st.hover) out.base.push(`@media (hover:hover){${sel}:hover{${decls(st.hover)}}}`);
  push(`${sel}:focus-visible`, decls(st.focus));
  push(`${sel}:active`, decls(st.active));
  push(`${sel}.is-active`, decls(st.activeState));
  for (const [w, props] of Object.entries(st.responsive ?? {})) {
    const width = parseInt(w, 10);
    const d = decls(props);
    if (!Number.isFinite(width) || !d) continue;
    if (!out.media.has(width)) out.media.set(width, []);
    out.media.get(width)!.push(`${sel}{${d}}`);
  }
}

/** Scopes the escape-hatch CSS: #id becomes the node's class, and every selector is prefixed with the root class. */
export function scopeCustomCss(css: string, scene: Scene, rootClass: string): string {
  if (!css?.trim()) return "";
  const rootId = scene.root.id;
  const mapSel = (sel: string) => {
    let s = sel.trim().replace(/#([a-zA-Z0-9_-]+)/g, (_, id) => (id === rootId ? `.${rootClass}` : `.${nodeClass(id)}`));
    if (!s.startsWith(`.${rootClass}`)) s = `.${rootClass} ${s}`;
    // ".root .root" can appear when the root is referenced mid-selector
    return s.replace(new RegExp(`\\.${rootClass} \\.${rootClass}`, "g"), `.${rootClass}`);
  };
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<\/?style[^>]*>/gi, "");
  let out = "";
  let i = 0;
  const stack: string[] = []; // at-rule names for open blocks
  while (i < cleaned.length) {
    const open = cleaned.indexOf("{", i);
    const close = cleaned.indexOf("}", i);
    if (open === -1 && close === -1) break;
    if (close !== -1 && (open === -1 || close < open)) {
      out += cleaned.slice(i, close + 1);
      stack.pop();
      i = close + 1;
      continue;
    }
    const prelude = cleaned.slice(i, open);
    const trimmed = prelude.trim();
    const inKeyframes = stack.some((s) => s.includes("keyframes"));
    if (trimmed.startsWith("@")) {
      // prefix keyframe names so they can't clash with the host page
      const at = trimmed.replace(/@((?:-webkit-)?keyframes)\s+([\w-]+)/, (_, kw, name) => `@${kw} ${rootClass}-${name}`);
      out += at + "{";
      stack.push(trimmed.split(/\s/)[0]);
    } else if (inKeyframes) {
      out += prelude + "{";
      stack.push("rule");
    } else {
      out += trimmed.split(",").map(mapSel).join(",") + "{";
      stack.push("rule");
    }
    i = open + 1;
  }
  // animation names referenced in declarations get the same prefix
  return out.replace(/animation(-name)?\s*:\s*([^;}]+)/g, (m, _n, val: string) => {
    const names = [...css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)].map((x) => x[1]);
    let v = val;
    for (const n of names) v = v.replace(new RegExp(`\\b${n}\\b`, "g"), `${rootClass}-${n}`);
    return m.replace(val, v);
  });
}

function behaviorCss(r: string, used: Set<string>): string {
  // Base styles for every section, plus what each behavior in use needs; the design's own styles layer on top.
  const rules = [
    `.${r},.${r} *,.${r} *::before,.${r} *::after{box-sizing:border-box}`,
    `.${r}{margin:0}`,
    `.${r} :where(h1,h2,h3,h4,h5,h6,p,figure,blockquote,ul,ol,dl,dd){margin:0}`,
    `.${r} :where(img,video){display:block;max-width:100%;height:auto}`,
    `.${r} :where(svg){display:inline-block;width:1.5em;height:1.5em;flex-shrink:0;vertical-align:middle}`,
    `.${r} :where(button){font:inherit;cursor:pointer}`,
    `.${r} :where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--color-primary,currentColor);outline-offset:3px}`,
  ];
  const by: Record<string, string[]> = {
    reveal: [
      // only hidden once JS has enhanced the section
      `.${r}.is-enhanced [data-sg-reveal]{opacity:0;transform:translateY(var(--sg-reveal-distance,24px));transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .6s cubic-bezier(.2,.7,.2,1);transition-delay:calc(var(--i,0) * var(--sg-stagger,70ms))}`,
      `.${r}.is-enhanced [data-sg-reveal].is-visible{opacity:1;transform:none}`,
    ],
    tabs: [
      `.${r} [data-sg-part="panel"][hidden]{display:none}`,
      `.${r} [data-sg-part="panel"].is-active{animation:${r}-fade .35s cubic-bezier(.2,.7,.2,1)}`,
      `@keyframes ${r}-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`,
    ],
    accordion: [
      `.${r}.is-enhanced [data-sg-part="content"]{display:grid;grid-template-rows:0fr;transition:grid-template-rows .35s cubic-bezier(.2,.7,.2,1)}`,
      `.${r}.is-enhanced [data-sg-part="item"].is-active [data-sg-part="content"]{grid-template-rows:1fr}`,
      `.${r} [data-sg-part="content"]>.sg-inner{overflow:hidden;min-height:0}`,
    ],
    carousel: [
      `.${r} [data-sg-part="track"]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;-webkit-overflow-scrolling:touch}`,
      `.${r} [data-sg-part="track"]::-webkit-scrollbar{display:none}`,
      `.${r} [data-sg-part="slide"]{flex:0 0 auto;scroll-snap-align:start}`,
      `.${r} [data-sg-part="dots"]{display:flex;gap:8px}`,
      `.${r} [data-sg-part="dots"] button{width:10px;height:10px;min-width:10px;padding:0;border-radius:999px;border:0;background:currentColor;opacity:.3;transition:opacity .2s,transform .2s}`,
      `.${r} [data-sg-part="dots"] button[aria-current="true"]{opacity:1;transform:scale(1.2)}`,
    ],
    filter: [
      `.${r} [data-sg-part="filter-item"]{transition:opacity .3s,transform .3s}`,
      `.${r} [data-sg-part="filter-item"].is-hidden{display:none}`,
    ],
    compare: [
      `.${r} [data-sg-behavior="compare"]{position:relative}`,
      `.${r} [data-sg-part="after"]{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--sg-pos,50%)) 0 0)}`,
      `.${r} [data-sg-part="range"]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}`,
    ],
    modal: [`.${r} dialog::backdrop{background:rgb(0 0 0 / .55)}`],
    counter: [`.${r} [data-sg-behavior="counter"]{font-variant-numeric:tabular-nums}`],
  };
  for (const b of used) rules.push(...(by[b] ?? []));
  rules.push(
    `@media (prefers-reduced-motion:reduce){.${r},.${r} *{transition:none!important;animation:none!important;scroll-behavior:auto!important}${used.has("reveal") ? `.${r}.is-enhanced [data-sg-reveal]{opacity:1;transform:none}` : ""}}`,
  );
  return rules.join("\n");
}

function renderNode(node: SceneNode, rootClass: string, isRoot: boolean, opts: CompileOptions, revealIndex: { i: number } | null): string {
  let tag = (node.tag || "div").toLowerCase();
  if (!ALLOWED_TAG.test(tag) || BLOCKED_TAGS.has(tag)) tag = "div";
  if (isRoot) tag = "section";

  const classes = [isRoot ? rootClass : nodeClass(node.id)];
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.attrs ?? {})) {
    const key = k.toLowerCase();
    if (!/^[a-z][a-z0-9:_-]*$/.test(key) || key.startsWith("on") || key === "style") continue;
    if ((key === "href" || key === "src" || key === "action") && /^\s*javascript:/i.test(v)) continue;
    if (key === "class") {
      classes.push(...String(v).split(/\s+/).filter(Boolean));
      continue;
    }
    attrs[key] = String(v);
  }
  if (node.behavior) {
    attrs["data-sg-behavior"] = node.behavior.type;
    if (node.behavior.options && Object.keys(node.behavior.options).length) attrs["data-sg-opts"] = JSON.stringify(node.behavior.options);
  }
  if (node.part) attrs["data-sg-part"] = node.part;
  if (revealIndex) {
    attrs["data-sg-reveal"] = "";
    attrs.style = `--i:${revealIndex.i++}`;
  }
  if (opts.editor) attrs["data-sg-id"] = node.id;
  if (tag === "img" && !("alt" in attrs)) attrs.alt = "";
  if (tag === "button" && !("type" in attrs)) attrs.type = "button";

  const attrStr = [`class="${escapeHtml(classes.join(" "))}"`, ...Object.entries(attrs).map(([k, v]) => (v === "" ? k : `${k}="${escapeHtml(v)}"`))].join(" ");

  if (tag === "svg") {
    const raw = (node.svg || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
    const inner = raw.replace(/^\s*<svg[^>]*>|<\/svg>\s*$/g, "");
    const own = raw.match(/^\s*<svg([^>]*)>/)?.[1] ?? ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"';
    const cleanedOwn = own.replace(/\sclass="[^"]*"/, "");
    return `<svg ${attrStr}${cleanedOwn} aria-hidden="${attrs["aria-label"] ? "false" : "true"}">${inner}</svg>`;
  }
  if (VOID.has(tag)) return `<${tag} ${attrStr}>`;

  // children of a reveal container get staggered indexes
  const childReveal = node.behavior?.type === "reveal" ? { i: 0 } : null;
  let inner = node.children?.length
    ? node.children.map((c) => renderNode(c, rootClass, false, opts, childReveal)).join("")
    : escapeHtml(node.text ?? "");
  if (node.part === "content") inner = `<div class="sg-inner">${inner}</div>`;
  return `<${tag} ${attrStr}>${inner}</${tag}>`;
}

export function behaviorsUsed(scene: Scene): Set<string> {
  const used = new Set<string>();
  walk(scene.root, (n) => {
    if (n.behavior) used.add(n.behavior.type);
  });
  return used;
}

export function compileScene(scene: Scene, opts: CompileOptions): SectionCode {
  const { rootClass } = opts;
  const out = { base: [] as string[], media: new Map<number, string[]>() };
  walk(scene.root, (n) => nodeCss(n, scene.root, rootClass, out));
  const media = [...out.media.entries()].sort((a, b) => a[0] - b[0]).map(([w, rules]) => `@media (min-width:${w}px){${rules.join("")}}`);
  const used = behaviorsUsed(scene);
  const css = [behaviorCss(rootClass, used), out.base.join("\n"), media.join("\n"), scopeCustomCss(scene.customCss ?? "", scene, rootClass)]
    .filter(Boolean)
    .join("\n");
  const html = renderNode(scene.root, rootClass, true, opts, null);
  const js = used.size ? runtimeJs(rootClass) : "";
  return { html, css, js };
}
