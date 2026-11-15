import { BEHAVIORS, PARTS, type BehaviorType, type PartType, type Scene, type SceneNode } from "./types";

const asStringMap = (v: unknown): Record<string, string> | undefined => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val == null || typeof val === "object") continue;
    out[k] = String(val);
  }
  return out;
};

/**
 * Turns untrusted JSON (from Claude or an import) into a well-formed Scene:
 * unique ids, string-only style values, known behaviors and parts only.
 */
export function normalizeScene(input: unknown): Scene {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rootIn = (obj.root ?? obj) as Record<string, unknown>;
  const seen = new Set<string>();
  let counter = 0;

  const node = (raw: unknown, depth: number): SceneNode | null => {
    if (!raw || typeof raw !== "object" || depth > 30) return null;
    const r = raw as Record<string, unknown>;
    let id = String(r.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || `node-${++counter}`;
    while (seen.has(id)) id = `${id}-${++counter}`;
    seen.add(id);
    const n: SceneNode = { id, tag: typeof r.tag === "string" && r.tag ? r.tag.toLowerCase() : "div" };
    if (typeof r.name === "string") n.name = r.name.slice(0, 80);
    if (r.text != null && typeof r.text !== "object") n.text = String(r.text);
    if (typeof r.svg === "string") n.svg = r.svg;
    const attrs = asStringMap(r.attrs);
    if (attrs && Object.keys(attrs).length) n.attrs = attrs;
    if (r.style && typeof r.style === "object") {
      const st = r.style as Record<string, unknown>;
      const style: SceneNode["style"] = {};
      for (const key of ["base", "hover", "focus", "active", "activeState"] as const) {
        const m = asStringMap(st[key]);
        if (m && Object.keys(m).length) style[key] = m;
      }
      if (st.responsive && typeof st.responsive === "object") {
        const resp: Record<string, Record<string, string>> = {};
        for (const [w, props] of Object.entries(st.responsive as Record<string, unknown>)) {
          const width = parseInt(w, 10);
          const m = asStringMap(props);
          if (Number.isFinite(width) && m && Object.keys(m).length) resp[String(width)] = m;
        }
        if (Object.keys(resp).length) style.responsive = resp;
      }
      if (Object.keys(style).length) n.style = style;
    }
    if (r.behavior && typeof r.behavior === "object") {
      const b = r.behavior as Record<string, unknown>;
      if (typeof b.type === "string" && (BEHAVIORS as readonly string[]).includes(b.type)) {
        n.behavior = { type: b.type as BehaviorType };
        const o = asStringMap(b.options);
        if (o && Object.keys(o).length) n.behavior.options = o;
      }
    }
    if (typeof r.part === "string" && (PARTS as readonly string[]).includes(r.part)) n.part = r.part as PartType;
    if (Array.isArray(r.children)) {
      const kids = r.children.map((c) => node(c, depth + 1)).filter((c): c is SceneNode => !!c);
      if (kids.length) n.children = kids;
    }
    return n;
  };

  const root = node(rootIn, 0);
  if (!root) throw new Error("The design has no root element.");
  root.tag = "section";
  return { version: 1, root, customCss: typeof obj.customCss === "string" ? obj.customCss : undefined };
}

export function parseSceneJson(text: string): Scene {
  // Tolerate code fences or stray text around the JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Claude's response did not contain a design.");
  return normalizeScene(JSON.parse(text.slice(start, end + 1)));
}
