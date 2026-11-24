import type { Scene } from "../scene/types";
import { DEFAULT_BREAKPOINTS, emptyDesignSystem } from "../tokens";
import type { DesignSystem, Project } from "../types";

/** A small journey section: heading, intro and a row of two stage cards. */
export function journeyScene(): Scene {
  return {
    version: 1,
    root: {
      id: "root",
      tag: "section",
      children: [
        { id: "title", name: "Headline", tag: "h2", text: "From design to silicon", style: { base: { fontSize: "var(--text-h2-size)" } } },
        { id: "intro", name: "Intro", tag: "p", text: "Five stages, one flow." },
        {
          id: "stages",
          name: "Stages",
          tag: "div",
          behavior: { type: "tabs" },
          style: { base: { display: "flex", flexDirection: "row", gap: "var(--space-md)" } },
          children: [
            { id: "card-1", name: "Stage card 1", tag: "button", part: "tab", text: "Spec", style: { hover: { transform: "translateY(-2px)" } } },
            { id: "card-2", name: "Stage card 2", tag: "button", part: "tab", text: "Verify" },
          ],
        },
      ],
    },
  };
}

export function designSystem(): DesignSystem {
  return { ...emptyDesignSystem("Test DS", "ds_test"), colors: { primary: "#0055ff", text: "#33393d" }, fonts: { heading: "Rubik, sans-serif" }, breakpoints: DEFAULT_BREAKPOINTS };
}

export function project(): Project {
  return {
    id: "p_test",
    name: "CDNS",
    kind: "project",
    businessType: "Hardware / physical product",
    businessDescription: "EDA software for chip design.",
    designSystem: designSystem(),
    defaults: { accessibility: "WCAG 2.2 AA", targetCms: "Plain HTML", allowJs: true, darkMode: false },
    createdAt: 0,
    updatedAt: 0,
  };
}
