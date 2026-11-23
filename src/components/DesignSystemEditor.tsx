"use client";
import { useState } from "react";
import { parseCssVariables, parseTokensJson, tokensToCss } from "@/lib/tokens";
import type { DesignSystem } from "@/lib/types";
import { BreakpointEditor } from "./BreakpointEditor";
import { Button, Card, Field, Input, Textarea, cx } from "./ui";

type Tab = "form" | "json" | "css" | "upload";
type MapKey = "colors" | "fonts" | "spacing" | "radii" | "shadows";

const GROUPS: { key: MapKey; label: string; isColor?: boolean }[] = [
  { key: "colors", label: "Colors", isColor: true },
  { key: "fonts", label: "Font families" },
  { key: "spacing", label: "Spacing" },
  { key: "radii", label: "Radius" },
  { key: "shadows", label: "Shadows" },
];

function TokenGroup({
  label,
  values,
  isColor,
  onChange,
}: {
  label: string;
  values: Record<string, string>;
  isColor?: boolean;
  onChange: (v: Record<string, string>) => void;
}) {
  const entries = Object.entries(values);
  const set = (i: number, k: string, v: string) => {
    const next = entries.map((e, j) => (j === i ? [k, v] : e));
    onChange(Object.fromEntries(next));
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-slate-800">{label}</legend>
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          {isColor && (
            <input
              type="color"
              aria-label={`${k} color picker`}
              value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"}
              onChange={(e) => set(i, k, e.target.value)}
              className="h-9 w-10 shrink-0 cursor-pointer rounded border border-slate-300"
            />
          )}
          <Input aria-label={`${label} name`} value={k} onChange={(e) => set(i, e.target.value, v)} className="max-w-44" />
          <Input aria-label={`${k} value`} value={v} onChange={(e) => set(i, k, e.target.value)} />
          <Button
            variant="danger"
            type="button"
            aria-label={`Remove ${k}`}
            onClick={() => onChange(Object.fromEntries(entries.filter((_, j) => j !== i)))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button variant="ghost" type="button" onClick={() => onChange({ ...values, [`new-${entries.length + 1}`]: "" })}>
        + Add
      </Button>
    </fieldset>
  );
}

export function DesignSystemEditor({ value, onChange }: { value: DesignSystem; onChange: (ds: DesignSystem) => void }) {
  const [tab, setTab] = useState<Tab>("form");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const importText = (text: string, kind: "json" | "css") => {
    setError("");
    setNotice("");
    try {
      const parsed = kind === "json" ? parseTokensJson(text, value) : parseCssVariables(text, value);
      const count =
        Object.keys(parsed.colors).length +
        Object.keys(parsed.fonts).length +
        Object.keys(parsed.spacing).length +
        Object.keys(parsed.radii).length +
        Object.keys(parsed.shadows).length +
        Object.keys(parsed.other).length +
        parsed.typography.length;
      if (!count) throw new Error("No tokens found in that input.");
      onChange({ ...parsed, id: value.id });
      setNotice(`Imported ${count} tokens. Review them in the Form tab.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse that input.");
    }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    importText(text, file.name.endsWith(".css") || /--[a-z]/i.test(text.slice(0, 500)) && !text.trim().startsWith("{") ? "css" : "json");
  };

  return (
    <Card className="space-y-5">
      <Field label="Design system name">
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </Field>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {(
          [
            ["form", "Form"],
            ["json", "Paste JSON tokens"],
            ["css", "Paste CSS variables"],
            ["upload", "Upload file"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      {tab === "form" && (
        <div className="grid gap-6 md:grid-cols-2">
          {GROUPS.map((g) => (
            <TokenGroup
              key={g.key}
              label={g.label}
              isColor={g.isColor}
              values={value[g.key]}
              onChange={(v) => onChange({ ...value, [g.key]: v })}
            />
          ))}
          <Field label="Font stylesheet URLs" help="One per line, e.g. a Google Fonts CSS link. Added to exports.">
            <Textarea
              value={value.fontImports.join("\n")}
              onChange={(e) => onChange({ ...value, fontImports: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
          {value.typography.length > 0 && (
            <div className="text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Typography styles</p>
              <ul className="mt-1 list-disc pl-5">
                {value.typography.map((t) => (
                  <li key={t.name}>
                    {t.name}: {[t.fontFamily, t.fontSize, t.fontWeight, t.lineHeight].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(tab === "json" || tab === "css") && (
        <div className="space-y-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="min-h-64 font-mono text-xs"
            placeholder={
              tab === "json"
                ? '{\n  "color": {\n    "primary": { "$value": "#4f46e5", "$type": "color" }\n  }\n}'
                : ":root {\n  --color-primary: #4f46e5;\n  --font-heading: 'Inter', sans-serif;\n}"
            }
          />
          <p className="text-xs text-slate-500">
            {tab === "json"
              ? "Supports W3C Design Tokens ($value / $type), Tokens Studio and plain nested JSON. A top-level \"breakpoints\" object is picked up too."
              : "Paste any block of CSS custom properties. Names are grouped by keyword (color, font, space, radius, shadow)."}
          </p>
          <Button type="button" onClick={() => importText(raw, tab)} disabled={!raw.trim()}>
            Import tokens
          </Button>
        </div>
      )}

      {tab === "upload" && (
        <div className="space-y-2">
          <input
            type="file"
            accept=".json,.css,application/json,text/css"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="block text-sm"
          />
          <p className="text-xs text-slate-500">Upload a tokens .json file or a .css file with custom properties.</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Default breakpoints" help="Used for every section unless changed in the brief.">
          <BreakpointEditor value={value.breakpoints} onChange={(breakpoints) => onChange({ ...value, breakpoints })} />
        </Field>
        <Field label="Brand notes" help="Tone of voice, do's and don'ts, imagery style, anything Claude should respect.">
          <Textarea value={value.brandNotes} onChange={(e) => onChange({ ...value, brandNotes: e.target.value })} className="min-h-32" />
        </Field>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Preview generated CSS variables</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{tokensToCss(value)}</pre>
      </details>
    </Card>
  );
}
