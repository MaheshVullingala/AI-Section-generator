/**
 * A structured, editable design. Claude produces this; the editor changes it;
 * the compiler turns it into paste-ready HTML, CSS and JS.
 */

/** CSS declarations in camelCase or kebab-case, e.g. { fontSize: "var(--text-h1-size)", "grid-template-columns": "1fr 1fr" }. */
export type StyleProps = Record<string, string>;

export interface NodeStyle {
  /** Mobile-first base styles. */
  base?: StyleProps;
  /** Overrides from a min-width breakpoint, keyed by the width in px, e.g. { "768": { ... } }. */
  responsive?: Record<string, StyleProps>;
  hover?: StyleProps;
  focus?: StyleProps;
  active?: StyleProps;
  /** Styles applied once a reveal/behavior marks the element active (e.g. selected tab, open item, visible). */
  activeState?: StyleProps;
}

export const BEHAVIORS = ["reveal", "tabs", "accordion", "carousel", "toggle", "counter", "modal", "filter", "compare", "parallax"] as const;
export type BehaviorType = (typeof BEHAVIORS)[number];

/**
 * Parts tell the runtime what each element does inside a behavior container:
 * tabs: tab, panel · accordion: item, trigger, content · carousel: track, slide, prev, next, dots
 * toggle: switch (alternate text goes in attrs["data-alt"] on any descendant) · modal: open, dialog, close
 * filter: filter-button (attrs["data-filter"]), filter-item (attrs["data-tags"]) · compare: range, after
 */
export const PARTS = [
  "tab",
  "panel",
  "item",
  "trigger",
  "content",
  "track",
  "slide",
  "prev",
  "next",
  "dots",
  "switch",
  "open",
  "dialog",
  "close",
  "filter-button",
  "filter-item",
  "range",
  "after",
] as const;
export type PartType = (typeof PARTS)[number];

export interface Behavior {
  type: BehaviorType;
  /** e.g. reveal: { stagger: "70", distance: "24" }; counter: { duration: "1600" }; carousel: { autoplay: "false" } */
  options?: Record<string, string>;
}

export interface SceneNode {
  id: string; // short, unique, stable (letters, digits, dashes)
  /** A friendly name shown in the layers panel, e.g. "Headline", "Pricing card". */
  name?: string;
  tag: string; // div, section, header, h1..h6, p, span, a, button, img, ul, ol, li, figure, figcaption, form, input, label, textarea, select, option, dialog, svg, blockquote, cite, strong, em, small, details, summary, video, picture, nav, article, aside, footer
  text?: string; // plain text content (escaped). Ignored when children exist.
  /** Raw inline SVG markup, only for tag "svg". */
  svg?: string;
  attrs?: Record<string, string>;
  style?: NodeStyle;
  behavior?: Behavior;
  part?: PartType;
  children?: SceneNode[];
}

export interface Scene {
  version: 1;
  root: SceneNode; // tag "section"
  /** Escape hatch for effects the style model can't express. Selectors use #id placeholders, e.g. "#card:hover #icon { ... }". */
  customCss?: string;
}
