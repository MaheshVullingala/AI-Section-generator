import type { Breakpoint, DesignSystem } from "./types";

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { name: "Mobile", width: 375 },
  { name: "Tablet", width: 768 },
  { name: "Laptop", width: 1024 },
  { name: "Desktop", width: 1440 },
];

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Placeholder id for the unsaved starter design system (stable so it can render on the server). */
export const DRAFT_DS_ID = "ds_draft";

export function emptyDesignSystem(name = "Untitled design system", id: string = uid("ds")): DesignSystem {
  return {
    id,
    name,
    colors: {
      primary: "#4f46e5",
      "primary-contrast": "#ffffff",
      background: "#ffffff",
      surface: "#f8fafc",
      text: "#0f172a",
      "text-muted": "#475569",
      border: "#e2e8f0",
    },
    fonts: {
      heading: "Inter, system-ui, sans-serif",
      body: "Inter, system-ui, sans-serif",
    },
    fontImports: [],
    typography: [],
    spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "40px", "2xl": "64px" },
    radii: { sm: "4px", md: "8px", lg: "16px", full: "9999px" },
    shadows: { sm: "0 1px 2px rgba(15,23,42,.06)", md: "0 8px 24px rgba(15,23,42,.10)" },
    other: {},
    breakpoints: DEFAULT_BREAKPOINTS,
    brandNotes: "",
    updatedAt: 0,
  };
}

const slug = (s: string) =>
  s
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

type Bucket = "colors" | "fonts" | "spacing" | "radii" | "shadows" | "other";

function bucketFor(path: string[], type: string | undefined, value: string): Bucket {
  const p = path.join(".").toLowerCase();
  const t = (type || "").toLowerCase();
  if (t === "color" || /colou?r|palette/.test(p)) return "colors";
  if (t === "fontfamily" || t === "fontfamilies" || /font-?famil/.test(p)) return "fonts";
  if (t === "spacing" || /spac|gap|gutter/.test(p)) return "spacing";
  if (t === "borderradius" || /radi/.test(p)) return "radii";
  if (t === "shadow" || t === "boxshadow" || /shadow|elevation/.test(p)) return "shadows";
  if (/^#([0-9a-f]{3,8})$/i.test(value) || /^(rgb|hsl|oklch)a?\(/i.test(value)) return "colors";
  return "other";
}

function stringifyValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    // shadows as arrays, or font stacks
    if (v.every((x) => typeof x === "string")) return v.join(", ");
    const parts = v.map(stringifyValue).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // W3C shadow object
    if ("offsetX" in o || "blur" in o) {
      return [o.inset ? "inset" : "", o.offsetX ?? o.x ?? 0, o.offsetY ?? o.y ?? 0, o.blur ?? 0, o.spread ?? 0, o.color ?? "rgba(0,0,0,.1)"]
        .filter((x) => x !== "")
        .join(" ");
    }
    // W3C dimension object
    if ("value" in o && "unit" in o) return `${o.value}${o.unit}`;
  }
  return null;
}

/**
 * Parses design tokens JSON. Supports W3C Design Tokens ($value/$type),
 * Tokens Studio (value/type) and plain nested objects of strings.
 */
export function parseTokensJson(text: string, base: DesignSystem = emptyDesignSystem()): DesignSystem {
  const data = JSON.parse(text) as Record<string, unknown>;
  const ds: DesignSystem = {
    ...base,
    colors: {},
    fonts: {},
    spacing: {},
    radii: {},
    shadows: {},
    other: {},
    typography: [],
    updatedAt: Date.now(),
  };
  if (typeof data.name === "string") ds.name = data.name;

  const walk = (node: unknown, path: string[], inheritedType?: string) => {
    if (node == null || typeof node !== "object" || Array.isArray(node)) return;
    const o = node as Record<string, unknown>;
    // "type" can also be a group name (e.g. a "type" scale), so only accept strings.
    const ownType = typeof o.$type === "string" ? o.$type : typeof o.type === "string" ? o.type : undefined;
    const type = ownType ?? inheritedType;
    // W3C uses $value; Tokens Studio uses value. ({value, unit} is a dimension, not a token.)
    const hasValue = "$value" in o || ("value" in o && !("unit" in o));
    if (hasValue && path.length) {
      const raw = "$value" in o ? o.$value : o.value;
      // Typography composite token
      if ((type || "").toLowerCase() === "typography" && raw && typeof raw === "object" && !Array.isArray(raw)) {
        const r = raw as Record<string, unknown>;
        ds.typography.push({
          name: slug(path.slice(path.length > 1 ? 1 : 0).join("-")),
          fontFamily: stringifyValue(r.fontFamily) ?? undefined,
          fontSize: stringifyValue(r.fontSize) ?? undefined,
          fontWeight: stringifyValue(r.fontWeight) ?? undefined,
          lineHeight: stringifyValue(r.lineHeight) ?? undefined,
          letterSpacing: stringifyValue(r.letterSpacing) ?? undefined,
        });
        return;
      }
      const value = stringifyValue(raw);
      if (value == null) return;
      const bucket = bucketFor(path, type, value);
      let key = slug(path.slice(1).join("-") || path[0]);
      if (bucket === "fonts") key = key.replace(/^(font-)?famil(y|ies)-/, "") || key;
      ds[bucket][key] = value;
      return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("$") || k === "name") continue;
      if (k === "breakpoints" && v && typeof v === "object") {
        const bps = Object.entries(v as Record<string, unknown>)
          .map(([n, w]) => ({ name: n, width: parseInt(String(stringifyValue((w as Record<string, unknown>)?.$value ?? (w as Record<string, unknown>)?.value ?? w)), 10) }))
          .filter((b) => Number.isFinite(b.width));
        if (bps.length) ds.breakpoints = bps.sort((a, b) => a.width - b.width);
        continue;
      }
      if (typeof v === "string" || typeof v === "number") {
        const value = String(v);
        const p = [...path, k];
        const bucket = bucketFor(p, type, value);
        ds[bucket][slug(p.slice(path.length ? 1 : 0).join("-") || k)] = value;
      } else {
        walk(v, [...path, k], type);
      }
    }
  };
  walk(data, []);
  return ds;
}

/** Parses a block of CSS custom properties, e.g. `:root { --color-primary: #000; }`. */
export function parseCssVariables(text: string, base: DesignSystem = emptyDesignSystem()): DesignSystem {
  const ds: DesignSystem = {
    ...base,
    colors: {},
    fonts: {},
    spacing: {},
    radii: {},
    shadows: {},
    other: {},
    updatedAt: Date.now(),
  };
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;}]+)[;}]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    const value = m[2].trim();
    const lower = name.toLowerCase();
    if (/font|family/.test(lower) && !/size|weight/.test(lower)) {
      ds.fonts[name.replace(/^(font-family-|font-)/, "")] = value;
      continue;
    }
    const bucket = bucketFor([lower], undefined, value);
    ds[bucket][name.replace(/^(color-|colour-|space-|spacing-|radius-|radii-|shadow-)/, "")] = value;
  }
  const imports = text.match(/@import\s+url\(["']?([^"')]+)["']?\)/g);
  if (imports) ds.fontImports = imports.map((i) => i.replace(/@import\s+url\(["']?|["']?\)/g, ""));
  return ds;
}

/** Token names the generated code must use, mapped to CSS custom properties. */
export function tokenVariables(ds: DesignSystem): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(ds.colors)) vars[`--color-${slug(k)}`] = v;
  for (const [k, v] of Object.entries(ds.fonts)) vars[`--font-${slug(k)}`] = v;
  for (const [k, v] of Object.entries(ds.spacing)) vars[`--space-${slug(k)}`] = v;
  for (const [k, v] of Object.entries(ds.radii)) vars[`--radius-${slug(k)}`] = v;
  for (const [k, v] of Object.entries(ds.shadows)) vars[`--shadow-${slug(k)}`] = v;
  for (const t of ds.typography) {
    const n = slug(t.name);
    if (t.fontSize) vars[`--text-${n}-size`] = t.fontSize;
    if (t.fontWeight) vars[`--text-${n}-weight`] = t.fontWeight;
    if (t.lineHeight) vars[`--text-${n}-line-height`] = t.lineHeight;
    if (t.fontFamily) vars[`--text-${n}-family`] = t.fontFamily;
    if (t.letterSpacing) vars[`--text-${n}-letter-spacing`] = t.letterSpacing;
  }
  for (const [k, v] of Object.entries(ds.other)) vars[`--${slug(k)}`] = v;
  return vars;
}

export function tokensToCss(ds: DesignSystem, selector = ":root"): string {
  const vars = tokenVariables(ds);
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}
