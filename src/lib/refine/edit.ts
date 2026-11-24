/**
 * Post-generation refinement: how a chat change was read (category, scope, viewports,
 * targets), what it actually changed, and deterministic guards that reject changes
 * outside what the person asked for. All pure functions over scenes, so they're testable.
 */
import { applyNodePatches, findNode, findParent } from "../scene/ops";
import type { Scene, SceneNode, StyleProps } from "../scene/types";
import type { Breakpoint, DesignSystem } from "../types";

export const EDIT_CATEGORIES = ["content", "appearance", "interaction", "structure"] as const;
export type EditCategory = (typeof EDIT_CATEGORIES)[number];
export const EDIT_SCOPES = ["selected-element", "component-group", "section"] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

/** Claude's reading of a change request (the <edit> tag of a refinement). */
export interface EditIntent {
  intent: string;
  category: EditCategory;
  scope: EditScope;
  /** Breakpoint names the change is limited to, or ["all"]. */
  viewports: string[];
  targetNodeIds: string[];
}

export interface SceneDiff {
  changed: string[];
  added: string[];
  removed: string[];
  customCss: boolean;
}

export interface ValidationCheck {
  name: "schema" | "scope" | "viewports" | "brand" | "quality";
  ok: boolean;
  detail?: string;
}

/** Stored on each version made from a chat change. */
export interface EditMeta {
  originalInstruction: string;
  edit: EditIntent;
  diff: SceneDiff;
  validation: ValidationCheck[];
  /** The version this change was made from (1-based), for conflict detection. */
  baseVersion: number;
  /** True when a teammate saved a version first and this change was merged on top. */
  rebased?: boolean;
  author?: string;
  model?: string;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number | null; attempts: number };
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Parses the <edit> tag. Missing or malformed fields fall back to safe defaults. */
export function parseEditIntent(text: string, focusNodeId?: string): EditIntent {
  const m = text.match(/<edit>([\s\S]*?)<\/edit>/);
  let raw: Record<string, unknown> = {};
  if (m) {
    try {
      const body = m[1];
      raw = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1)) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  const category = EDIT_CATEGORIES.includes(raw.category as EditCategory) ? (raw.category as EditCategory) : "appearance";
  const scope = focusNodeId ? "selected-element" : EDIT_SCOPES.includes(raw.scope as EditScope) ? (raw.scope as EditScope) : "section";
  const viewports = (Array.isArray(raw.viewports) ? raw.viewports : []).map((v) => str(v, 40)).filter(Boolean);
  const targets = (Array.isArray(raw.targetNodeIds) ? raw.targetNodeIds : []).map((v) => str(v, 80)).filter(Boolean).slice(0, 20);
  return {
    intent: str(raw.intent),
    category,
    scope,
    viewports: viewports.length ? viewports : ["all"],
    targetNodeIds: focusNodeId ? [focusNodeId] : targets,
  };
}

// ---------------------------------------------------------------------------
// Diffing

/** JSON with sorted keys, so two nodes that differ only in key order compare equal. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
}

type Flat = Map<string, { own: string; node: SceneNode; parent: string | null }>;

/** Every node by id, with a fingerprint of its own fields (children reduced to their ids). */
function flatten(scene: Scene): Flat {
  const out: Flat = new Map();
  const visit = (n: SceneNode, parent: string | null) => {
    const { children, ...own } = n;
    out.set(n.id, { own: stableJson({ ...own, children: children?.map((c) => c.id) }), node: n, parent });
    children?.forEach((c) => visit(c, n.id));
  };
  visit(scene.root, null);
  return out;
}

export function diffScenes(before: Scene, after: Scene): SceneDiff {
  const a = flatten(before);
  const b = flatten(after);
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [id, v] of b) {
    const old = a.get(id);
    if (!old) added.push(id);
    else if (old.own !== v.own) changed.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) removed.push(id);
  return { changed, added, removed, customCss: (before.customCss ?? "") !== (after.customCss ?? "") };
}

export const diffSize = (d: SceneDiff) => d.changed.length + d.added.length + d.removed.length + (d.customCss ? 1 : 0);

function subtreeIds(n: SceneNode | null, into = new Set<string>()): Set<string> {
  if (!n) return into;
  into.add(n.id);
  n.children?.forEach((c) => subtreeIds(c, into));
  return into;
}

/** True when a node's own fields are equal apart from which children it has. */
function onlyChildrenDiffer(a: SceneNode, b: SceneNode): boolean {
  return stableJson({ ...a, children: undefined }) === stableJson({ ...b, children: undefined });
}

const label = (scene: Scene, id: string) => findNode(scene, id)?.name || id;

/**
 * With an element selected, every change must stay inside it. Its parent may only gain
 * or lose children (to add, duplicate or remove the selected element). Returns problems.
 */
export function scopeViolations(before: Scene, after: Scene, diff: SceneDiff, focusNodeId: string): string[] {
  const focusBefore = findNode(before, focusNodeId);
  if (!focusBefore) return [];
  const allowed = subtreeIds(focusBefore);
  subtreeIds(findNode(after, focusNodeId), allowed);
  const parent = findParent(before, focusNodeId);
  const problems: string[] = [];
  for (const id of diff.changed) {
    if (allowed.has(id)) continue;
    if (parent && id === parent.id) {
      const now = findNode(after, id);
      if (now && onlyChildrenDiffer(parent, now)) continue;
    }
    problems.push(`changed "${label(before, id)}"`);
  }
  for (const id of diff.added) {
    if (allowed.has(id)) continue;
    const p = findParent(after, id);
    if (p && (allowed.has(p.id) || p.id === parent?.id)) continue;
    problems.push(`added "${label(after, id)}" outside the selected element`);
  }
  for (const id of diff.removed) if (!allowed.has(id)) problems.push(`removed "${label(before, id)}"`);
  return problems;
}

/** The styles that apply to a node at a viewport width (mobile-first min-width cascade). */
export function effectiveStyle(n: SceneNode, width: number): StyleProps {
  const out: StyleProps = { ...(n.style?.base ?? {}) };
  const steps = Object.entries(n.style?.responsive ?? {})
    .map(([w, p]) => [parseInt(w, 10), p] as const)
    .filter(([w]) => Number.isFinite(w) && w <= width)
    .sort((x, y) => x[0] - y[0]);
  for (const [, p] of steps) Object.assign(out, p);
  // Normalise camelCase and kebab-case to one key, so a rename alone isn't a change.
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v]));
}

/** Resolves viewport names ("Mobile", "tablet", "768") to breakpoint widths. Null means all. */
export function viewportWidths(viewports: string[], breakpoints: Breakpoint[]): number[] | null {
  if (!viewports.length || viewports.some((v) => v.toLowerCase() === "all")) return null;
  const widths = new Set<number>();
  for (const v of viewports) {
    const bp = breakpoints.find((b) => b.name.toLowerCase() === v.toLowerCase() || String(b.width) === v.replace(/px$/, ""));
    if (bp) widths.add(bp.width);
  }
  return widths.size ? [...widths] : null;
}

/**
 * A change limited to some screen sizes must look identical at every other breakpoint:
 * same structure and content, and the same effective styles. Returns problems.
 */
export function viewportViolations(before: Scene, after: Scene, diff: SceneDiff, targetWidths: number[], breakpoints: Breakpoint[]): string[] {
  const problems: string[] = [];
  if (diff.added.length || diff.removed.length) problems.push("added or removed elements, which affects every screen size");
  const others = breakpoints.map((b) => b.width).filter((w) => !targetWidths.includes(w));
  const a = flatten(before);
  const b = flatten(after);
  for (const id of diff.changed) {
    const x = a.get(id)!.node;
    const y = b.get(id)!.node;
    const { style: sx, children: cx, ...restX } = x;
    const { style: sy, children: cy, ...restY } = y;
    const kids = (c?: SceneNode[]) => c?.map((n) => n.id).join(",");
    const statesX = stableJson([sx?.hover, sx?.focus, sx?.active, sx?.activeState]);
    const statesY = stableJson([sy?.hover, sy?.focus, sy?.active, sy?.activeState]);
    if (stableJson(restX) !== stableJson(restY) || kids(cx) !== kids(cy) || statesX !== statesY) {
      problems.push(`changed the content or states of "${x.name || id}", which shows at every screen size`);
      continue;
    }
    const bp = others.find((w) => stableJson(effectiveStyle(x, w)) !== stableJson(effectiveStyle(y, w)));
    if (bp !== undefined) problems.push(`changed "${x.name || id}" at ${breakpoints.find((q) => q.width === bp)?.name ?? `${bp}px`} too`);
  }
  return problems;
}

/** Colours and fonts in changed nodes that bypass the design system tokens. */
export function brandWarnings(after: Scene, diff: SceneDiff, ds: DesignSystem): string[] {
  const colors = new Set(Object.values(ds.colors).map((c) => c.toLowerCase().replace(/\s/g, "")));
  const fonts = Object.values(ds.fonts).map((f) => f.toLowerCase());
  const out = new Set<string>();
  for (const id of [...diff.changed, ...diff.added]) {
    const n = findNode(after, id);
    if (!n?.style) continue;
    const all: StyleProps[] = [n.style.base, n.style.hover, n.style.focus, n.style.active, n.style.activeState, ...Object.values(n.style.responsive ?? {})].filter(
      (x): x is StyleProps => !!x,
    );
    for (const props of all) {
      for (const [k, v] of Object.entries(props)) {
        const raw = v.toLowerCase().replace(/var\([^)]*\)/g, "");
        for (const c of raw.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) ?? []) {
          if (!colors.has(c.replace(/\s/g, ""))) out.add(`"${n.name || id}" uses ${c}, which isn't a design system colour`);
        }
        if (/^font-?family$/i.test(k) && !/var\(/.test(v) && fonts.length && !fonts.some((f) => f.includes(v.toLowerCase().split(",")[0].replace(/["']/g, "").trim()))) {
          out.add(`"${n.name || id}" uses the font ${v}, which isn't in the design system`);
        }
      }
    }
  }
  return [...out].slice(0, 5);
}

// ---------------------------------------------------------------------------
// Version-aware patches

export interface ScenePatch {
  nodes: SceneNode[];
  customCss?: string;
}

/** The smallest set of subtrees that turns `before` into `after` with applyNodePatches. */
export function minimalPatch(before: Scene, after: Scene, diff = diffScenes(before, after)): ScenePatch {
  const roots = new Set<string>();
  // An added or removed node is applied by replacing its parent.
  for (const id of diff.changed) roots.add(id);
  for (const id of diff.added) {
    const p = findParent(after, id);
    if (p) roots.add(p.id);
  }
  for (const id of diff.removed) {
    const p = findParent(before, id);
    if (p) roots.add(p.id);
  }
  // Keep only the topmost: drop any root that sits inside another root.
  const covered = (id: string) => {
    let p = findParent(after, id);
    while (p) {
      if (roots.has(p.id)) return true;
      p = findParent(after, p.id);
    }
    return false;
  };
  const nodes = [...roots]
    .filter((id) => !covered(id))
    .map((id) => findNode(after, id))
    .filter((n): n is SceneNode => !!n);
  return { nodes, ...(diff.customCss ? { customCss: after.customCss ?? "" } : {}) };
}

export type RebaseResult = { ok: true; scene: Scene } | { ok: false; conflicts: string[] };

/**
 * Someone saved a newer version while this change was being made. Re-applies the change
 * on top of their version if the two touched different elements; otherwise reports a conflict.
 */
export function rebasePatch(base: Scene, latest: Scene, patch: ScenePatch): RebaseResult {
  const theirs = diffScenes(base, latest);
  const touchedByThem = new Set([...theirs.changed, ...theirs.added, ...theirs.removed]);
  const conflicts: string[] = [];
  for (const n of patch.nodes) {
    const ours = subtreeIds(findNode(base, n.id));
    subtreeIds(n, ours);
    const clash = [...ours].find((id) => touchedByThem.has(id));
    if (clash) conflicts.push(label(latest, clash) || clash);
    else if (!findNode(latest, n.id)) conflicts.push(n.name || n.id);
  }
  if (patch.customCss !== undefined && theirs.customCss) conflicts.push("custom CSS");
  if (conflicts.length) return { ok: false, conflicts };
  const { scene } = applyNodePatches(latest, patch.nodes);
  return { ok: true, scene: patch.customCss !== undefined ? { ...scene, customCss: patch.customCss } : scene };
}
