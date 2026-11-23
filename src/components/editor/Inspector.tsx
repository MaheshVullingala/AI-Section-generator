"use client";
import { useState } from "react";
import { BEHAVIORS, PARTS, type BehaviorType, type NodeStyle, type PartType, type SceneNode, type StyleProps } from "@/lib/scene/types";
import type { Breakpoint } from "@/lib/types";
import { Button, Field, Input, Select, Spinner, Textarea, cx } from "../ui";

type Target = { key: "base" | "hover" | "focus" | "active" | "activeState" } | { key: "responsive"; width: string };

const QUICK: { prop: string; label: string; color?: boolean; options?: string[] }[] = [
  { prop: "color", label: "Text color", color: true },
  { prop: "background", label: "Background", color: true },
  { prop: "fontSize", label: "Font size" },
  { prop: "fontWeight", label: "Weight", options: ["300", "400", "500", "600", "700", "800"] },
  { prop: "lineHeight", label: "Line height" },
  { prop: "textAlign", label: "Align", options: ["left", "center", "right"] },
  { prop: "padding", label: "Padding" },
  { prop: "margin", label: "Margin" },
  { prop: "gap", label: "Gap" },
  { prop: "borderRadius", label: "Radius" },
  { prop: "display", label: "Display", options: ["block", "flex", "grid", "inline-flex", "none"] },
  { prop: "gridTemplateColumns", label: "Grid columns" },
  { prop: "width", label: "Width" },
  { prop: "maxWidth", label: "Max width" },
];

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const camel = (k: string) => (k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));

/** Reads a prop whether it was written in camelCase or kebab-case. */
function getProp(props: StyleProps, prop: string): [string | undefined, string] {
  if (props[prop] != null) return [props[prop], prop];
  const k = kebab(prop);
  if (props[k] != null) return [props[k], k];
  return [undefined, prop];
}

function targetProps(style: NodeStyle | undefined, t: Target): StyleProps {
  if (!style) return {};
  if (t.key === "responsive") return style.responsive?.[t.width] ?? {};
  return style[t.key] ?? {};
}

function setTargetProps(style: NodeStyle | undefined, t: Target, props: StyleProps): NodeStyle {
  const next: NodeStyle = { ...(style ?? {}) };
  const clean = Object.fromEntries(Object.entries(props).filter(([k, v]) => k.trim() && v !== ""));
  if (t.key === "responsive") {
    const resp = { ...(next.responsive ?? {}) };
    if (Object.keys(clean).length) resp[t.width] = clean;
    else delete resp[t.width];
    next.responsive = resp;
  } else if (Object.keys(clean).length) next[t.key] = clean;
  else delete next[t.key];
  return next;
}

function KeyValues({
  values,
  onChange,
  keyPlaceholder = "property",
  hide = [],
}: {
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  keyPlaceholder?: string;
  hide?: string[];
}) {
  const entries = Object.entries(values).filter(([k]) => !hide.includes(k));
  const hidden = Object.fromEntries(Object.entries(values).filter(([k]) => hide.includes(k)));
  const commit = (list: [string, string][]) => onChange({ ...hidden, ...Object.fromEntries(list) });
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            aria-label="Name"
            value={k}
            onChange={(e) => commit(entries.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))}
            className="w-2/5 px-2 py-1 font-mono text-xs"
          />
          <Input
            aria-label={`${k} value`}
            value={v}
            onChange={(e) => commit(entries.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
            className="px-2 py-1 font-mono text-xs"
          />
          <button type="button" aria-label={`Remove ${k}`} className="px-1 text-slate-400 hover:text-red-600" onClick={() => commit(entries.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => commit([...entries, [`${keyPlaceholder}-${entries.length + 1}`, ""]])}>
        + Add {keyPlaceholder}
      </button>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="border-t border-slate-200 pt-3">
      <summary className="mb-2 cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</summary>
      <div className="space-y-3">{children}</div>
    </details>
  );
}

export function Inspector({
  node,
  isRoot,
  breakpoints,
  onChange,
  onDuplicate,
  onDelete,
  onAskClaude,
  asking,
}: {
  node: SceneNode;
  isRoot: boolean;
  breakpoints: Breakpoint[];
  onChange: (n: SceneNode) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAskClaude: (instruction: string) => void;
  asking: boolean;
}) {
  const [target, setTarget] = useState<Target>({ key: "base" });
  const [ask, setAsk] = useState("");
  const widths = [...new Set([...breakpoints.map((b) => String(b.width)), ...Object.keys(node.style?.responsive ?? {})])].sort((a, b) => +a - +b);
  const props = targetProps(node.style, target);
  const setProps = (p: StyleProps) => onChange({ ...node, style: setTargetProps(node.style, target, p) });
  const isLeaf = !node.children?.length && node.tag !== "svg";
  const bpName = (w: string) => breakpoints.find((b) => String(b.width) === w)?.name ?? `${w}px`;
  const targets: [Target, string][] = [
    [{ key: "base" }, "Base"],
    ...widths.map((w) => [{ key: "responsive", width: w } as Target, `≥ ${bpName(w)}`] as [Target, string]),
    [{ key: "hover" }, "Hover"],
    [{ key: "focus" }, "Focus"],
    [{ key: "active" }, "Pressed"],
    [{ key: "activeState" }, "Active state"],
  ];
  const same = (a: Target, b: Target) => a.key === b.key && (a.key !== "responsive" || (b.key === "responsive" && a.width === b.width));
  const quickKeys = QUICK.flatMap((q) => [q.prop, kebab(q.prop)]);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Input
            aria-label="Layer name"
            value={node.name ?? ""}
            placeholder={node.tag}
            onChange={(e) => onChange({ ...node, name: e.target.value })}
            className="px-2 py-1 font-semibold"
          />
          <p className="mt-1 font-mono text-xs text-slate-500">
            &lt;{node.tag}&gt; #{node.id}
          </p>
        </div>
        {!isRoot && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onDuplicate}>
              Duplicate
            </Button>
            <Button variant="danger" className="px-2 py-1 text-xs" onClick={onDelete}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <Section title="Ask Claude">
        <Textarea
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder={`Change just this ${node.name || node.tag}, e.g. "make it a 3-step timeline with icons"`}
          className="min-h-16"
        />
        <Button
          className="w-full"
          disabled={asking || !ask.trim()}
          onClick={() => {
            onAskClaude(ask);
            setAsk("");
          }}
        >
          {asking && <Spinner />} {asking ? "Claude is editing…" : "Ask Claude"}
        </Button>
      </Section>

      <Section title="Content">
        {isLeaf && (
          <Field label="Text">
            <Textarea value={node.text ?? ""} onChange={(e) => onChange({ ...node, text: e.target.value })} className="min-h-16" />
          </Field>
        )}
        {node.tag === "svg" && (
          <Field label="SVG markup">
            <Textarea value={node.svg ?? ""} onChange={(e) => onChange({ ...node, svg: e.target.value })} className="min-h-20 font-mono text-xs" />
          </Field>
        )}
        <Field label="Attributes" help="href, src, alt, aria-label, data-alt (toggle text), data-filter, data-tags…">
          <KeyValues values={node.attrs ?? {}} onChange={(attrs) => onChange({ ...node, attrs })} keyPlaceholder="attribute" />
        </Field>
      </Section>

      <Section title="Style">
        <div className="flex flex-wrap gap-1">
          {targets.map(([t, label]) => {
            const has = Object.keys(targetProps(node.style, t)).length > 0;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setTarget(t)}
                className={cx(
                  "rounded px-2 py-1 text-xs",
                  same(t, target) ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  has && !same(t, target) && "ring-1 ring-indigo-300",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          {target.key === "base"
            ? "Applies at every width (mobile first)."
            : target.key === "responsive"
              ? `Overrides from ${target.width}px and up.`
              : target.key === "activeState"
                ? "Applied when a behavior marks this element active (selected tab, open item, current slide, toggled on, revealed)."
                : `Applied on ${target.key === "active" ? "press" : target.key}.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK.map((q) => {
            const [val, key] = getProp(props, q.prop);
            const set = (v: string) => {
              const next = { ...props };
              delete next[key];
              if (v) next[key] = v;
              setProps(next);
            };
            return (
              <label key={q.prop} className="block">
                <span className="text-xs text-slate-500">{q.label}</span>
                <div className="flex gap-1">
                  {q.color && (
                    <input
                      type="color"
                      aria-label={`${q.label} picker`}
                      value={/^#[0-9a-f]{6}$/i.test(val ?? "") ? val : "#000000"}
                      onChange={(e) => set(e.target.value)}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border border-slate-300"
                    />
                  )}
                  {q.options ? (
                    <Select value={val ?? ""} onChange={(e) => set(e.target.value)} className="px-1.5 py-1 text-xs">
                      <option value="">–</option>
                      {q.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input value={val ?? ""} onChange={(e) => set(e.target.value)} placeholder="–" className="px-1.5 py-1 font-mono text-xs" />
                  )}
                </div>
              </label>
            );
          })}
        </div>
        <Field label="Other properties">
          <KeyValues
            values={props}
            onChange={(p) => setProps(Object.fromEntries(Object.entries(p).map(([k, v]) => [camel(k), v])))}
            hide={quickKeys}
          />
        </Field>
      </Section>

      <Section title="Interaction" defaultOpen={!!node.behavior || !!node.part}>
        <Field label="Behavior" help="Makes this element a tabs, accordion, carousel… container, or animates it.">
          <Select
            value={node.behavior?.type ?? ""}
            onChange={(e) => onChange({ ...node, behavior: e.target.value ? { type: e.target.value as BehaviorType, options: node.behavior?.options } : undefined })}
          >
            <option value="">None</option>
            {BEHAVIORS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        {node.behavior && (
          <Field label="Behavior options">
            <KeyValues
              values={node.behavior.options ?? {}}
              onChange={(options) => onChange({ ...node, behavior: { ...node.behavior!, options } })}
              keyPlaceholder="option"
            />
          </Field>
        )}
        <Field label="Role inside a behavior" help="e.g. tab, panel, trigger, slide, switch.">
          <Select value={node.part ?? ""} onChange={(e) => onChange({ ...node, part: (e.target.value || undefined) as PartType | undefined })}>
            <option value="">None</option>
            {PARTS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
      </Section>
    </div>
  );
}
