import type { Intensity } from "./catalog";
import type { EnhanceRecord } from "./refine/brief";
import type { EditMeta } from "./refine/edit";
import type { Scene } from "./scene/types";

export interface Breakpoint {
  name: string;
  width: number; // px
}

export interface TypographyToken {
  name: string; // e.g. "h1", "body"
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

/** Normalized design system. Every input format is converted into this shape. */
export interface DesignSystem {
  id: string;
  name: string;
  colors: Record<string, string>;
  fonts: Record<string, string>; // role -> font-family stack, e.g. heading, body
  fontImports: string[]; // e.g. Google Fonts stylesheet URLs
  typography: TypographyToken[];
  spacing: Record<string, string>;
  radii: Record<string, string>;
  shadows: Record<string, string>;
  other: Record<string, string>; // any other tokens (motion, z-index, ...)
  breakpoints: Breakpoint[];
  brandNotes: string;
  updatedAt: number;
}

export type QuestionType = "text" | "textarea" | "select" | "number" | "boolean";

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[];
  placeholder?: string;
  help?: string;
}

export interface SectionSpec {
  businessType: string;
  businessDescription: string;
  sectionType: string;
  answers: Record<string, string>; // question label -> answer
  followUps: { question: string; answer: string }[];
  content: {
    mode: "provided" | "generate";
    copy: string;
    images: string;
    ctas: string;
  };
  interactions: string[];
  extraInteractionNotes: string;
  constraints: {
    accessibility: string;
    targetCms: string;
    allowJs: boolean;
    darkMode: boolean;
  };
  breakpoints: Breakpoint[];
  /** Creative intensity for all 3 designs (Minimal / Balanced / Expressive). Absent means balanced. */
  intensity?: Intensity;
}

export interface SectionCode {
  html: string;
  css: string;
  js: string;
}

export interface Variant extends SectionCode {
  id: string;
  direction: string;
  name: string;
  rationale: string;
  scene: Scene;
  issues: string[]; // results of the static quality check
}

export interface SectionVersion extends SectionCode {
  id: string;
  /** The editable design. Absent only on sections saved before the visual editor existed. */
  scene?: Scene;
  instruction: string; // what produced this version
  issues?: string[]; // results of the static quality check
  createdAt: number;
  /** How a chat change was read, what it touched and how it was checked. Absent on manual saves and older versions. */
  meta?: EditMeta;
}

export interface SavedSection {
  id: string; // also the section's root CSS class
  title: string;
  designSystemId: string;
  spec: SectionSpec;
  versions: SectionVersion[];
  updatedAt: number;
}

export interface ProjectDefaults {
  accessibility: string;
  targetCms: string;
  allowJs: boolean;
  darkMode: boolean;
}

/** A project groups many sections (e.g. a whole site) that share one design system. */
export interface Project {
  id: string;
  name: string;
  /** "blank" projects hold quick one-off sections and use the default design system. */
  kind: "project" | "blank";
  businessType: string;
  businessDescription: string;
  designSystem: DesignSystem;
  defaults: ProjectDefaults;
  createdAt: number;
  updatedAt: number;
}

export interface ChatImage {
  name: string;
  /** data: URL (JPEG/PNG), downscaled in the browser before upload. */
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: ChatImage[];
  links?: string[];
  /** What an assistant message did, for rendering. */
  kind?: "text" | "questions" | "variants" | "refined" | "error";
  /** Selected element the user was talking about, if any. */
  focusNodeId?: string;
  createdAt: number;
}

/** A section inside a project: its chat, the latest 3 options, and the chosen design's versions. */
export interface Section extends SavedSection {
  projectId: string;
  messages: ChatMessage[];
  variants: Variant[];
  /** The brief Claude assembled from the chat, once it had enough to design. */
  brief?: Record<string, unknown>;
  /** The Enhance Prompt result the person accepted, kept so the brief can be traced back to their words. */
  enhancement?: EnhanceRecord;
}

/** A person's Claude allowance for the current month (from section_gen.my_allowance()). */
export interface Allowance {
  role: string;
  /** USD for the month including approved extra, or null for no limit. */
  limit_usd: number | null;
  base_usd: number | null;
  extra_usd: number;
  /** Extra USD requested and waiting for an admin. */
  pending_usd: number;
  spent_usd: number;
  /** Fractions of the limit at which to warn, e.g. [0.7, 0.9]. */
  warn_at: number[];
  /** First day of the month, YYYY-MM-DD. */
  month: string;
}
