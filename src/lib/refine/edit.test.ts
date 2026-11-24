import { describe, expect, it } from "vitest";
import { parseRefineResponse } from "../claude";
import { applyNodePatches, findNode, removeNode, updateNode } from "../scene/ops";
import type { Scene } from "../scene/types";
import { DEFAULT_BREAKPOINTS } from "../tokens";
import {
  brandWarnings,
  diffScenes,
  effectiveStyle,
  minimalPatch,
  parseEditIntent,
  rebasePatch,
  scopeViolations,
  viewportViolations,
  viewportWidths,
} from "./edit";
import { designSystem, journeyScene } from "./fixtures";

const setText = (s: Scene, id: string, text: string) => updateNode(s, id, (n) => ({ ...n, text }));

describe("parseEditIntent", () => {
  it("reads the edit tag", () => {
    const e = parseEditIntent('<edit>{"intent":"Stack stages on mobile","category":"structure","scope":"component-group","viewports":["Mobile"],"targetNodeIds":["stages"]}</edit>');
    expect(e).toEqual({ intent: "Stack stages on mobile", category: "structure", scope: "component-group", viewports: ["Mobile"], targetNodeIds: ["stages"] });
  });

  it("falls back safely, and a selected element always sets the scope", () => {
    expect(parseEditIntent("no tag")).toMatchObject({ category: "appearance", scope: "section", viewports: ["all"], targetNodeIds: [] });
    expect(parseEditIntent('<edit>{"scope":"section","targetNodeIds":["root"]}</edit>', "title")).toMatchObject({ scope: "selected-element", targetNodeIds: ["title"] });
  });
});

describe("scope guard", () => {
  it("lets a selected heading change without touching anything else", () => {
    const before = journeyScene();
    const after = setText(before, "title", "Design to silicon, step by step");
    const diff = diffScenes(before, after);
    expect(diff).toEqual({ changed: ["title"], added: [], removed: [], customCss: false });
    expect(scopeViolations(before, after, diff, "title")).toEqual([]);
  });

  it("rejects a change that leaks outside the selected element", () => {
    const before = journeyScene();
    const after = setText(setText(before, "title", "New"), "intro", "Changed too");
    expect(scopeViolations(before, after, diffScenes(before, after), "title")).toEqual(['changed "Intro"']);
  });

  it("allows removing or duplicating the selected element via its parent", () => {
    const before = journeyScene();
    const removed = removeNode(before, "card-2");
    expect(scopeViolations(before, removed, diffScenes(before, removed), "card-2")).toEqual([]);
    const dup = updateNode(before, "stages", (n) => ({ ...n, children: [...n.children!, { id: "card-3", tag: "button", part: "tab", text: "Tape-out" }] }));
    expect(scopeViolations(before, dup, diffScenes(before, dup), "card-2")).toEqual([]);
  });

  it("rejects restyling the parent when only a child was selected", () => {
    const before = journeyScene();
    const after = updateNode(before, "stages", (n) => ({ ...n, style: { base: { display: "grid" } } }));
    expect(scopeViolations(before, after, diffScenes(before, after), "card-1")).toEqual(['changed "Stages"']);
  });
});

describe("viewport guard", () => {
  const bps = DEFAULT_BREAKPOINTS;
  const mobile = viewportWidths(["mobile"], bps)!;

  it("resolves breakpoint names and numbers", () => {
    expect(mobile).toEqual([375]);
    expect(viewportWidths(["768px", "Desktop"], bps)).toEqual([768, 1440]);
    expect(viewportWidths(["all"], bps)).toBeNull();
  });

  it("accepts a mobile-only change that restores the old value from Tablet up", () => {
    const before = journeyScene();
    const after = updateNode(before, "stages", (n) => ({
      ...n,
      style: { base: { ...n.style!.base, flexDirection: "column" }, responsive: { "768": { "flex-direction": "row" } } },
    }));
    const diff = diffScenes(before, after);
    expect(viewportViolations(before, after, diff, mobile, bps)).toEqual([]);
    expect(effectiveStyle(findNode(after, "stages")!, 1440)["flex-direction"]).toBe("row");
  });

  it("rejects a mobile-only instruction that alters the desktop layout", () => {
    const before = journeyScene();
    const after = updateNode(before, "stages", (n) => ({ ...n, style: { base: { ...n.style!.base, flexDirection: "column" } } }));
    expect(viewportViolations(before, after, diffScenes(before, after), mobile, bps)).toEqual(['changed "Stages" at Tablet too']);
  });

  it("rejects content changes for a viewport-limited request", () => {
    const before = journeyScene();
    const after = setText(before, "intro", "Mobile copy");
    expect(viewportViolations(before, after, diffScenes(before, after), mobile, bps)[0]).toContain("every screen size");
  });
});

describe("brandWarnings", () => {
  it("flags raw colours and fonts outside the design system", () => {
    const before = journeyScene();
    const after = updateNode(before, "title", (n) => ({ ...n, style: { base: { color: "#ff00aa", fontFamily: "Comic Sans MS" } } }));
    const ok = updateNode(before, "title", (n) => ({ ...n, style: { base: { color: "#0055FF", background: "var(--color-primary, #123456)", fontFamily: "Rubik" } } }));
    expect(brandWarnings(after, diffScenes(before, after), designSystem())).toHaveLength(2);
    expect(brandWarnings(ok, diffScenes(before, ok), designSystem())).toEqual([]);
  });
});

describe("version-aware patches", () => {
  it("a minimal patch reproduces the edit exactly", () => {
    const before = journeyScene();
    const after = removeNode(setText(before, "card-1", "Specify"), "intro");
    const patch = minimalPatch(before, after);
    // Removing the intro means replacing its parent, the root, which also covers card-1.
    expect(patch.nodes.map((n) => n.id)).toEqual(["root"]);
    expect(applyNodePatches(before, patch.nodes).scene).toEqual(after);
    const small = setText(before, "card-1", "Specify");
    expect(minimalPatch(before, small).nodes.map((n) => n.id)).toEqual(["card-1"]);
  });

  it("re-applies a change on top of a teammate's edit to a different element", () => {
    const base = journeyScene();
    const theirs = setText(base, "intro", "Teammate's intro");
    const ours = setText(base, "title", "Our headline");
    const r = rebasePatch(base, theirs, minimalPatch(base, ours));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(findNode(r.scene, "title")!.text).toBe("Our headline");
      expect(findNode(r.scene, "intro")!.text).toBe("Teammate's intro");
    }
  });

  it("reports a conflict instead of overwriting the same element", () => {
    const base = journeyScene();
    const theirs = setText(base, "card-1", "Theirs");
    const ours = updateNode(base, "stages", (n) => ({ ...n, style: { base: { display: "grid" } } }));
    expect(rebasePatch(base, theirs, minimalPatch(base, ours))).toEqual({ ok: false, conflicts: ["Stage card 1"] });
  });
});

describe("failed edits", () => {
  it("leave the current design untouched", () => {
    const scene = journeyScene();
    const snapshot = structuredClone(scene);
    expect(() => parseRefineResponse('<rationale>x</rationale><patch>{"nodes":[{"id":"nope","tag":"p"}]}</patch>', scene)).toThrow();
    expect(() => parseRefineResponse("<patch>{not json</patch>", scene)).toThrow();
    expect(scene).toEqual(snapshot);
  });
});
