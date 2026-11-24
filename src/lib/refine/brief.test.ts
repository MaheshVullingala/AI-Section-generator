import { describe, expect, it } from "vitest";
import { sectionContext, specFromBrief } from "../prompts";
import { specForProject } from "../storage";
import { briefFromEnhanced, checkIntent, type EnhanceResult, parseEnhanceResponse, promptQuality, protectedTerms, restoreMissing } from "./brief";
import { project } from "./fixtures";

const reply = (json: unknown) => `<result>${JSON.stringify(json)}</result>`;

const good = {
  needsEnhancement: true,
  refinedBrief: {
    title: "Chip design journey",
    objective: "Explain the semiconductor design stages",
    audience: "Engineering decision-makers",
    sectionType: "Timeline / process",
    summary: "An interactive journey through the semiconductor design-to-silicon flow for engineering decision-makers.",
    contentRequirements: [
      { text: "Present the key design stages", source: "user" },
      { text: "Use Rubik for headings", source: "project" },
      "Keep technical accuracy",
    ],
    copy: "",
    ctas: "",
    creativeDirection: { visualStyle: "technical-editorial", interactionLevel: "high", motionLevel: "moderate" },
    interactions: ["Tabs", "Not a real interaction"],
    responsiveRequirements: { desktop: "interactive overview", mobile: "touch-friendly stage navigation" },
  },
  suggestions: [
    { type: "interaction", description: "Add selectable stage information" },
    { type: "bogus", description: "Use a subtle circuit-trace motif" },
    { type: "motion", description: "" },
  ],
  needsClarification: false,
  clarifyingQuestions: [],
};

describe("promptQuality", () => {
  it("scores a short prompt low and lists what's missing", () => {
    const q = promptQuality("Create an interactive section explaining the semiconductor design journey.");
    expect(q.detailed).toBe(false);
    expect(q.score).toBeLessThan(75);
    expect(q.missing).toContain("who it's for");
  });

  it("marks a complete, specific prompt as detailed", () => {
    const q = promptQuality(
      'A pricing section for small engineering teams, so that they sign up for a trial. Headline "Pick your plan". Three plans: Starter $29, Team $79, Enterprise (contact us). ' +
        "Add a monthly/yearly toggle that shows 20% off yearly, hover states on each card, and stack the cards vertically on mobile with the Team plan first.",
    );
    expect(q.detailed).toBe(true);
    expect(q.missing).toEqual([]);
  });
});

describe("intent preservation", () => {
  it("finds quoted copy, figures, names and acronyms but not sentence-start words", () => {
    const terms = protectedTerms('Create a hero for Cadence EDA tools. Headline "Design at the speed of silicon". Mention 40% faster signoff.');
    expect(terms).toEqual(expect.arrayContaining(["Design at the speed of silicon", "40%", "Cadence", "EDA"]));
    expect(terms).not.toContain("Create");
    expect(terms).not.toContain("Headline");
    expect(terms).not.toContain("Mention");
  });

  it("flags dropped terms and figures the person never gave", () => {
    const brief = parseEnhanceResponse(reply({ ...good, refinedBrief: { ...good.refinedBrief, summary: "A journey that is 3x faster with 99% yield." } }), "x").refinedBrief;
    const check = checkIntent('Explain the Cadence flow in "five stages"', brief);
    expect(check.missing).toEqual(expect.arrayContaining(["five stages", "Cadence"]));
    expect(check.added).toEqual(expect.arrayContaining(["3x", "99%"]));
  });

  it("doesn't flag figures that came from the prompt or the project", () => {
    const brief = parseEnhanceResponse(reply({ ...good, refinedBrief: { ...good.refinedBrief, summary: "Show 40% faster signoff, used by 2,000 teams." } }), "x").refinedBrief;
    expect(checkIntent("Mention 40% faster signoff", brief, "Used by 2000 teams").added).toEqual([]);
  });

  it("restores dropped terms word for word as a requirement from the person", () => {
    const r = parseEnhanceResponse(reply(good), "p");
    const fixed = restoreMissing(r, ["five stages"]);
    expect(fixed.refinedBrief.contentRequirements.at(-1)).toEqual({ text: 'Keep exactly as the person wrote: "five stages"', source: "user" });
    expect(checkIntent('"five stages"', fixed.refinedBrief).missing).toEqual([]);
  });
});

describe("parseEnhanceResponse", () => {
  it("validates the reply into the pre-generation schema", () => {
    const r = parseEnhanceResponse(reply(good), "Create an interactive chip design journey");
    expect(r).toMatchObject({ schemaVersion: "1.0", mode: "pre-generation", originalPrompt: "Create an interactive chip design journey", preserveOriginalIntent: true });
    expect(r.refinedBrief.interactions).toEqual(["Tabs"]);
    expect(r.refinedBrief.contentRequirements.map((c) => c.source)).toEqual(["user", "project", "ai"]);
    expect(r.suggestions).toEqual([
      { id: "suggestion-1", type: "interaction", description: "Add selectable stage information", status: "suggested" },
      { id: "suggestion-2", type: "style", description: "Use a subtle circuit-trace motif", status: "suggested" },
    ]);
  });

  it("defaults wrong types instead of trusting them", () => {
    const r = parseEnhanceResponse(reply({ refinedBrief: { sectionType: "Spaceship", creativeDirection: { motionLevel: "extreme" }, summary: 42 } }), "my prompt");
    expect(r.refinedBrief.sectionType).toBe("Custom");
    expect(r.refinedBrief.creativeDirection.motionLevel).toBe("moderate");
    expect(r.refinedBrief.summary).toBe("my prompt");
  });

  it("returns no suggestions when the prompt is already detailed", () => {
    const r = parseEnhanceResponse(reply({ ...good, needsEnhancement: false }), "p");
    expect(r.needsEnhancement).toBe(false);
    expect(r.suggestions).toEqual([]);
  });

  it("only asks for clarification when there are questions", () => {
    expect(parseEnhanceResponse(reply({ ...good, needsClarification: true, clarifyingQuestions: [] }), "p").needsClarification).toBe(false);
    expect(parseEnhanceResponse(reply({ ...good, needsClarification: true, clarifyingQuestions: ["Which product?"] }), "p").needsClarification).toBe(true);
  });

  it("throws on a reply with no JSON", () => {
    expect(() => parseEnhanceResponse("Sorry, I can't.", "p")).toThrow(SyntaxError);
  });
});

describe("briefFromEnhanced", () => {
  const result: EnhanceResult = parseEnhanceResponse(reply(good), "p");

  it("only passes on suggestions the person turned on", () => {
    const off = JSON.stringify(briefFromEnhanced(result));
    expect(off).not.toContain("selectable stage information");
    const on = briefFromEnhanced({ ...result, suggestions: result.suggestions.map((s) => (s.id === "suggestion-1" ? { ...s, status: "accepted" } : s)) });
    expect(on.interactionNotes).toContain("Add selectable stage information");
  });

  it("gives all 3 designs the same validated requirements", () => {
    const p = project();
    const base = { ...specForProject(p), intensity: "expressive" as const };
    const spec = specFromBrief(p, briefFromEnhanced(result), base);
    expect(spec.sectionType).toBe("Timeline / process");
    expect(spec.interactions).toEqual(["Tabs"]);
    expect(spec.intensity).toBe("expressive");
    expect(spec.answers["Other requirements"]).toContain("Present the key design stages (from the person)");
    expect(spec.answers["Other requirements"]).toContain("Do not invent");
    // The design system and brief are one shared block; only the direction differs per design.
    const ctx = sectionContext(p.designSystem, spec);
    expect(ctx).toContain("CREATIVE INTENSITY: Expressive");
    expect(ctx).toContain("Present the key design stages");
  });
});
