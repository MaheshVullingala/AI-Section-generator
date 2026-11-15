"use client";
import { useEffect, useState } from "react";
import { BUSINESS_TYPES, INTERACTIONS, SECTION_TYPES, questionsFor } from "@/lib/catalog";
import * as store from "@/lib/storage";
import { DRAFT_DS_ID, emptyDesignSystem, uid } from "@/lib/tokens";
import type { DesignSystem, SavedSection, SectionSpec, Variant } from "@/lib/types";
import { BreakpointEditor, sortBreakpoints } from "./BreakpointEditor";
import { DesignSystemEditor } from "./DesignSystemEditor";
import { makeVersion, SectionEditor } from "./editor/SectionEditor";
import { Preview } from "./Preview";
import { Button, Card, Chip, Field, Input, Select, Spinner, Textarea, cx } from "./ui";

const STEPS = ["Design system", "Business", "Section", "Content", "Breakpoints", "Review", "Choose design", "Refine & export"];


function emptySpec(ds: DesignSystem): SectionSpec {
  return {
    businessType: "",
    businessDescription: "",
    sectionType: "Hero",
    answers: {},
    followUps: [],
    content: { mode: "generate", copy: "", images: "", ctas: "" },
    interactions: ["Hover and focus states"],
    extraInteractionNotes: "",
    constraints: { accessibility: "WCAG 2.2 AA", targetCms: "Any / plain HTML", allowJs: true, darkMode: false },
    breakpoints: ds.breakpoints,
  };
}


async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

type VariantResult = { ok: true; variant: Variant } | { ok: false; direction: string; error: string };

export function Wizard() {
  const [step, setStep] = useState(0);
  const [systems, setSystems] = useState<DesignSystem[]>([]);
  const [ds, setDs] = useState<DesignSystem>(() => emptyDesignSystem("My design system", DRAFT_DS_ID));
  const [spec, setSpec] = useState<SectionSpec>(() => emptySpec(ds));
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [followUpsChecked, setFollowUpsChecked] = useState(false);
  const [variants, setVariants] = useState<VariantResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<SavedSection | null>(null);
  const [saved, setSaved] = useState<SavedSection[]>([]);

  useEffect(() => {
    // Load from localStorage after mount (not available during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSystems(store.listDesignSystems());
    setSaved(store.listSections());
  }, []);

  const patch = (p: Partial<SectionSpec>) => setSpec((s) => ({ ...s, ...p }));
  const questions = questionsFor(spec.sectionType);
  const go = (n: number) => {
    setError("");
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveDs = () => {
    const toSave = ds.id === DRAFT_DS_ID ? { ...ds, id: uid("ds") } : ds;
    setDs(toSave);
    store.saveDesignSystem(toSave);
    setSystems(store.listDesignSystems());
    patch({ breakpoints: toSave.breakpoints });
    go(1);
  };

  const checkFollowUps = async () => {
    setFollowUpsLoading(true);
    setError("");
    try {
      const { questions } = await postJson<{ questions: string[] }>("/api/followups", { spec });
      patch({ followUps: questions.map((q) => ({ question: q, answer: "" })) });
      setFollowUpsChecked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFollowUpsLoading(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError("");
    setVariants([]);
    go(6);
    try {
      const { variants } = await postJson<{ variants: VariantResult[] }>("/api/generate", { designSystem: ds, spec });
      setVariants(variants);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const choose = (v: Variant) => {
    const s: SavedSection = {
      id: v.id, // the root class doubles as the section id
      title: `${spec.sectionType}: ${v.name}`,
      designSystemId: ds.id,
      spec,
      versions: [makeVersion(v, `Picked "${v.name}" (${v.direction})`, v.issues, v.scene)],
      updatedAt: 0, // set when saved
    };
    setSection(s);
    store.saveSection(s);
    setSaved(store.listSections());
    go(7);
  };

  const openSaved = (s: SavedSection) => {
    const sys = store.listDesignSystems().find((d) => d.id === s.designSystemId);
    if (sys) setDs(sys);
    setSpec(s.spec);
    setSection(s);
    go(7);
  };

  const canNext: Record<number, boolean> = {
    1: !!spec.businessType,
    2: !!spec.sectionType,
    4: sortBreakpoints(spec.breakpoints).length > 0,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Section Generator</h1>
          <p className="text-sm text-slate-600">Design system in, interactive website sections out. Powered by Claude.</p>
        </div>
        {saved.length > 0 && (
          <Select
            aria-label="Open a saved section"
            value=""
            onChange={(e) => {
              const s = saved.find((x) => x.id === e.target.value);
              if (s) openSaved(s);
            }}
            className="max-w-xs"
          >
            <option value="">Open a saved section…</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        )}
      </header>

      <nav aria-label="Progress" className="mb-6 flex flex-wrap gap-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i <= 5 && go(i)}
            disabled={i > 5 && !(i === 6 && variants.length) && !(i === 7 && section)}
            aria-current={step === i ? "step" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-medium disabled:opacity-40",
              step === i ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>

      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {step === 0 && (
        <div className="space-y-4">
          {systems.length > 0 && (
            <Card className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Saved:</span>
              {systems.map((s) => (
                <Chip key={s.id} active={s.id === ds.id} onClick={() => setDs(s)}>
                  {s.name}
                </Chip>
              ))}
              <Button variant="ghost" onClick={() => setDs(emptyDesignSystem("New design system"))}>
                + New
              </Button>
            </Card>
          )}
          <DesignSystemEditor value={ds} onChange={setDs} />
          <div className="flex justify-end">
            <Button onClick={saveDs}>Save and continue</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <Card className="space-y-5">
          <div>
            <h2 className="mb-3 font-semibold text-slate-900">What type of business or product is this for?</h2>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_TYPES.map((b) => (
                <Chip key={b} active={spec.businessType === b} onClick={() => patch({ businessType: b })}>
                  {b}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="Describe the business or product" help="What it sells, who it's for, what makes it different. The more specific, the better the design.">
            <Textarea value={spec.businessDescription} onChange={(e) => patch({ businessDescription: e.target.value })} />
          </Field>
          <Nav back={() => go(0)} next={() => go(2)} nextDisabled={!canNext[1]} />
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-5">
          <Field label="Section type">
            <Select value={spec.sectionType} onChange={(e) => patch({ sectionType: e.target.value, answers: {} })}>
              {Object.keys(SECTION_TYPES).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            {questions.map((q) => {
              const val = spec.answers[q.label] ?? "";
              const set = (v: string) => patch({ answers: { ...spec.answers, [q.label]: v } });
              return (
                <Field key={q.id} label={q.label} help={q.help}>
                  {q.type === "select" ? (
                    <Select value={val} onChange={(e) => set(e.target.value)}>
                      <option value="">No preference</option>
                      {q.options?.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </Select>
                  ) : q.type === "boolean" ? (
                    <Select value={val} onChange={(e) => set(e.target.value)}>
                      <option value="">No preference</option>
                      <option>Yes</option>
                      <option>No</option>
                    </Select>
                  ) : q.type === "textarea" ? (
                    <Textarea value={val} onChange={(e) => set(e.target.value)} placeholder={q.placeholder} />
                  ) : (
                    <Input type={q.type === "number" ? "number" : "text"} value={val} onChange={(e) => set(e.target.value)} placeholder={q.placeholder} />
                  )}
                </Field>
              );
            })}
          </div>
          <Nav back={() => go(1)} next={() => go(3)} />
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-5">
          <Field label="Copy">
            <div className="mb-2 flex gap-2">
              <Chip active={spec.content.mode === "generate"} onClick={() => patch({ content: { ...spec.content, mode: "generate" } })}>
                Let Claude write it
              </Chip>
              <Chip active={spec.content.mode === "provided"} onClick={() => patch({ content: { ...spec.content, mode: "provided" } })}>
                I&apos;ll provide it
              </Chip>
            </div>
            <Textarea
              value={spec.content.copy}
              onChange={(e) => patch({ content: { ...spec.content, copy: e.target.value } })}
              placeholder={spec.content.mode === "provided" ? "Paste headlines, body copy, plan details, quotes..." : "Optional notes: key messages, words to use or avoid..."}
              className="min-h-32"
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Image URLs" help="One per line. Leave empty for placeholders.">
              <Textarea value={spec.content.images} onChange={(e) => patch({ content: { ...spec.content, images: e.target.value } })} />
            </Field>
            <Field label="CTA labels and links" help="e.g. Start free trial → /signup">
              <Textarea value={spec.content.ctas} onChange={(e) => patch({ content: { ...spec.content, ctas: e.target.value } })} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-800">Interactions</p>
            <div className="flex flex-wrap gap-2">
              {INTERACTIONS.map((i) => (
                <Chip
                  key={i}
                  active={spec.interactions.includes(i)}
                  onClick={() =>
                    patch({ interactions: spec.interactions.includes(i) ? spec.interactions.filter((x) => x !== i) : [...spec.interactions, i] })
                  }
                >
                  {i}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="Interaction notes (optional)">
            <Input value={spec.extraInteractionNotes} onChange={(e) => patch({ extraInteractionNotes: e.target.value })} placeholder="e.g. cards tilt slightly on hover" />
          </Field>
          <Nav back={() => go(2)} next={() => go(4)} />
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-5">
          <Field label="Breakpoints for this section" help="The design is built mobile-first with a media query at each width.">
            <BreakpointEditor value={spec.breakpoints} onChange={(breakpoints) => patch({ breakpoints })} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Accessibility target">
              <Select value={spec.constraints.accessibility} onChange={(e) => patch({ constraints: { ...spec.constraints, accessibility: e.target.value } })}>
                <option>WCAG 2.2 AA</option>
                <option>WCAG 2.2 AAA</option>
              </Select>
            </Field>
            <Field label="Where will it be pasted?">
              <Select value={spec.constraints.targetCms} onChange={(e) => patch({ constraints: { ...spec.constraints, targetCms: e.target.value } })}>
                {["Any / plain HTML", "WordPress (Custom HTML block)", "Webflow (Embed)", "Shopify (Custom Liquid)", "HubSpot", "Framer (Embed)", "Squarespace (Code block)"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={spec.constraints.allowJs} onChange={(e) => patch({ constraints: { ...spec.constraints, allowJs: e.target.checked } })} />
              Allow JavaScript (uncheck for CSS-only)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={spec.constraints.darkMode} onChange={(e) => patch({ constraints: { ...spec.constraints, darkMode: e.target.checked } })} />
              Support dark mode
            </label>
          </div>
          <Nav back={() => go(3)} next={() => go(5)} nextDisabled={!canNext[4]} />
        </Card>
      )}

      {step === 5 && (
        <Card className="space-y-5">
          <h2 className="font-semibold text-slate-900">Review the brief</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            <Summary k="Design system" v={ds.name} />
            <Summary k="Business" v={`${spec.businessType}${spec.businessDescription ? `: ${spec.businessDescription}` : ""}`} />
            <Summary k="Section" v={spec.sectionType} />
            <Summary k="Answers" v={Object.entries(spec.answers).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") || "None"} />
            <Summary k="Interactions" v={spec.interactions.join(", ") || "None"} />
            <Summary k="Breakpoints" v={sortBreakpoints(spec.breakpoints).map((b) => `${b.name} ${b.width}px`).join(", ")} />
          </dl>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Let Claude check the brief for gaps</p>
              <Button variant="secondary" onClick={checkFollowUps} disabled={followUpsLoading}>
                {followUpsLoading && <Spinner />} {followUpsChecked ? "Check again" : "Check brief"}
              </Button>
            </div>
            {followUpsChecked && spec.followUps.length === 0 && <p className="mt-2 text-sm text-slate-600">The brief looks complete.</p>}
            <div className="mt-3 space-y-3">
              {spec.followUps.map((f, i) => (
                <Field key={i} label={f.question}>
                  <Input
                    value={f.answer}
                    onChange={(e) => patch({ followUps: spec.followUps.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })}
                  />
                </Field>
              ))}
            </div>
          </div>
          <Nav back={() => go(4)} next={generate} nextLabel="Generate 3 designs" nextDisabled={generating} />
        </Card>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Pick a design to refine</h2>
            <Button variant="secondary" onClick={generate} disabled={generating}>
              Regenerate
            </Button>
          </div>
          {generating && (
            <Card className="flex items-center gap-3 text-sm text-slate-700">
              <Spinner /> Claude is designing 3 variants in parallel. This usually takes a minute or two.
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            {variants.map((r, i) =>
              r.ok ? (
                <Card key={r.variant.id} className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">{r.variant.direction}</p>
                    <h3 className="font-semibold text-slate-900">{r.variant.name}</h3>
                  </div>
                  <Preview code={r.variant} designSystem={ds} rootClass={r.variant.id} breakpoints={spec.breakpoints} compact />
                  <p className="text-sm text-slate-600">{r.variant.rationale}</p>
                  <Issues issues={r.variant.issues} />
                  <Button className="mt-auto" onClick={() => choose(r.variant)}>
                    Use this design
                  </Button>
                </Card>
              ) : (
                <Card key={i} className="text-sm">
                  <p className="font-medium text-slate-900">{r.direction}</p>
                  <p className="mt-1 text-red-700">{r.error}</p>
                </Card>
              ),
            )}
          </div>
          <Nav back={() => go(5)} />
        </div>
      )}

      {step === 7 && section && (
        <SectionEditor
          key={section.id}
          section={section}
          designSystem={ds}
          onChange={(updated) => {
            setSection(updated);
            store.saveSection(updated);
            setSaved(store.listSections());
          }}
          onBackToVariants={variants.length ? () => go(6) : undefined}
        />
      )}
    </div>
  );
}

function Nav({ back, next, nextLabel = "Continue", nextDisabled }: { back?: () => void; next?: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="flex justify-between pt-2">
      {back ? (
        <Button variant="ghost" onClick={back}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button onClick={next} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      )}
    </div>
  );
}

function Issues({ issues }: { issues: string[] }) {
  if (!issues?.length) {
    return <p className="text-xs font-medium text-emerald-700">✓ Passed scoping, accessibility and interaction checks</p>;
  }
  return (
    <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
      <p className="mb-1 font-semibold">Quality check found {issues.length} issue{issues.length > 1 ? "s" : ""}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-medium text-slate-500">{k}</dt>
      <dd className="text-slate-900">{v}</dd>
    </div>
  );
}
