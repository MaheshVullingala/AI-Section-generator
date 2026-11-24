import { beforeEach, describe, expect, it, vi } from "vitest";
import { designSystem, journeyScene, project } from "../refine/fixtures";
import { specForProject } from "../storage";

const replies: string[] = [];
vi.mock("../claude", async (orig) => {
  const actual = await orig<typeof import("../claude")>();
  return {
    ...actual,
    complete: vi.fn(async (opts: { onUsage?: (u: unknown) => void }) => {
      opts.onUsage?.({ model: "claude-sonnet-5-5", input: 1000, output: 200, cacheRead: 500, cacheWrite: 0, cost: 0.004 });
      const next = replies.shift();
      if (next === undefined) throw new Error("no reply queued");
      return next;
    }),
  };
});

const { refineDesign } = await import("./design");

const node = (text: string, id = "title") => JSON.stringify({ nodes: [{ id, name: "Headline", tag: "h2", text, style: { base: { fontSize: "var(--text-h2-size)" } } }] });
const opts = () => ({ ds: designSystem(), spec: specForProject(project()), rootClass: "sec-1", scene: journeyScene(), instruction: "Make this heading more impactful", focusNodeId: "title" });

beforeEach(() => {
  replies.length = 0;
});

describe("refineDesign", () => {
  it("applies a classified, localized patch and reports what changed and what it cost", async () => {
    replies.push(`<edit>{"intent":"Stronger headline","category":"content","scope":"selected-element","viewports":["all"],"targetNodeIds":["title"]}</edit><rationale>Sharper.</rationale><patch>${node("Silicon, start to finish")}</patch>`);
    const r = await refineDesign(opts());
    expect(r.type).toBe("refined");
    if (r.type !== "refined") return;
    expect(r.edit.category).toBe("content");
    expect(r.diff).toEqual({ changed: ["title"], added: [], removed: [], customCss: false });
    expect(r.validation.find((c) => c.name === "scope")?.ok).toBe(true);
    expect(r.patch.nodes.map((n) => n.id)).toEqual(["title"]);
    expect(r.usage).toMatchObject({ input: 1000, output: 200, cacheRead: 500, attempts: 1 });
    expect(r.html).toContain("Silicon, start to finish");
  });

  it("retries once when a change leaks outside the selection, then succeeds", async () => {
    const leaky = JSON.stringify({
      nodes: [
        { id: "title", tag: "h2", text: "New" },
        { id: "intro", tag: "p", text: "Also changed" },
      ],
    });
    replies.push(`<edit>{"category":"content"}</edit><patch>${leaky}</patch>`, `<edit>{"category":"content"}</edit><patch>${node("New")}</patch>`);
    const r = await refineDesign(opts());
    expect(r.type).toBe("refined");
    if (r.type === "refined") expect(r.usage.attempts).toBe(2);
  });

  it("returns an actionable error and leaves the design untouched when every attempt fails", async () => {
    const o = opts();
    const snapshot = structuredClone(o.scene);
    const leaky = JSON.stringify({ nodes: [{ id: "intro", tag: "p", text: "Wrong element" }] });
    replies.push(`<patch>${leaky}</patch>`, `<patch>${leaky}</patch>`);
    await expect(refineDesign(o)).rejects.toThrow(/didn't apply that change.*Whole section/);
    expect(o.scene).toEqual(snapshot);
  });

  it("rejects a mobile-only request that changes the desktop layout", async () => {
    const o = { ...opts(), focusNodeId: undefined, instruction: "Stack the stages vertically on mobile" };
    const stages = (style: object) => JSON.stringify({ nodes: [{ ...journeyScene().root.children![2], style }] });
    const edit = `<edit>{"category":"structure","scope":"component-group","viewports":["Mobile"],"targetNodeIds":["stages"]}</edit>`;
    replies.push(`${edit}<patch>${stages({ base: { display: "flex", flexDirection: "column" } })}</patch>`, `${edit}<patch>${stages({ base: { display: "flex", flexDirection: "column" } })}</patch>`);
    await expect(refineDesign(o)).rejects.toThrow(/at Tablet too/);
    replies.length = 0;
    replies.push(`${edit}<patch>${stages({ base: { display: "flex", flexDirection: "column", gap: "var(--space-md)" }, responsive: { "768": { flexDirection: "row" } } })}</patch>`);
    const r = await refineDesign(o);
    expect(r.type).toBe("refined");
    if (r.type === "refined") expect(r.validation.find((c) => c.name === "viewports")?.ok).toBe(true);
  });

  it("asks one question instead of guessing when the target is ambiguous", async () => {
    replies.push(`<edit>{"category":"appearance","scope":"section"}</edit><question>Which card do you mean, Spec or Verify?</question>`);
    const r = await refineDesign({ ...opts(), focusNodeId: undefined, instruction: "make the card blue" });
    expect(r).toMatchObject({ type: "question", question: "Which card do you mean, Spec or Verify?" });
  });
});
