"use client";
import { SECTION_TYPES, type EnhanceResult, type IntentCheck, type PromptQuality, type Suggestion } from "@/lib/refine/brief";
import { Button, Card, cx, Input, Select, Spinner, Textarea } from "../ui";

export interface EnhanceState {
  original: string;
  result: EnhanceResult;
  quality: PromptQuality;
  intent: IntentCheck;
}

const SOURCE_LABEL = { user: "From you", project: "Brand rule", ai: "Inferred" } as const;

/**
 * The refined creative brief from Enhance Prompt, editable before generating.
 * What the person wrote is locked and labelled; Claude's ideas are opt-in chips.
 */
export function EnhanceCard({
  state,
  onChange,
  onAccept,
  onRegenerate,
  onRevert,
  onSkip,
  busy,
}: {
  state: EnhanceState;
  onChange: (result: EnhanceResult) => void;
  onAccept: () => void;
  onRegenerate: () => void;
  onRevert: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const { result, quality, intent } = state;
  const b = result.refinedBrief;
  const set = (patch: Partial<typeof b>) => onChange({ ...result, refinedBrief: { ...b, ...patch } });
  const toggle = (s: Suggestion) =>
    onChange({ ...result, suggestions: result.suggestions.map((x) => (x.id === s.id ? { ...x, status: x.status === "accepted" ? "suggested" : "accepted" } : x)) });
  const accepted = result.suggestions.filter((s) => s.status === "accepted").length;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="sg-label text-indigo-600">Enhanced brief</p>
          <h2 className="font-display text-lg font-semibold text-slate-900">{result.needsEnhancement ? "Here's your brief, refined" : "Your prompt is already detailed"}</h2>
          <p className="text-sm text-slate-600">
            {result.needsEnhancement
              ? "Edit anything below, turn on the ideas you like, then generate. Your own words are kept as written."
              : "I kept it as you wrote it. Generate when you're ready, or edit the brief first."}
          </p>
        </div>
        <span className="sg-label rounded border border-slate-200 px-2 py-1 text-slate-600" title={quality.missing.length ? `Not yet covered: ${quality.missing.join(", ")}` : "Covers the essentials"}>
          Prompt score {quality.score}/100
        </span>
      </div>

      {result.needsClarification && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-semibold">One thing would help</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {result.clarifyingQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Add the answer to the brief below, or revert and add it to your prompt.</p>
        </div>
      )}
      {intent.added.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Check these figures: {intent.added.join(", ")}. You didn&apos;t give them, so remove them if they aren&apos;t real.
        </p>
      )}
      {intent.missing.length > 0 && (
        <p className="text-xs text-slate-500">Restored from your prompt word for word: {intent.missing.map((m) => `"${m}"`).join(", ")}.</p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-800">Brief</span>
        <Textarea value={b.summary} onChange={(e) => set({ summary: e.target.value })} rows={4} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Objective</span>
          <Input value={b.objective} onChange={(e) => set({ objective: e.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Audience</span>
          <Input value={b.audience} onChange={(e) => set({ audience: e.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Section type</span>
          <Select value={b.sectionType} onChange={(e) => set({ sectionType: e.target.value })}>
            {SECTION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </label>
      </div>

      {b.contentRequirements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-800">Requirements</p>
          <ul className="space-y-1">
            {b.contentRequirements.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span
                  className={cx(
                    "sg-label mt-0.5 shrink-0 rounded px-1.5 py-0.5",
                    r.source === "user" ? "bg-amber-100 text-amber-800" : r.source === "project" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {SOURCE_LABEL[r.source]}
                </span>
                <span className="flex-1">{r.text}</span>
                {r.source !== "user" && (
                  <button
                    type="button"
                    className="text-xs text-slate-500 underline hover:text-red-600"
                    aria-label={`Remove requirement: ${r.text}`}
                    onClick={() => set({ contentRequirements: b.contentRequirements.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Desktop</span>
          <Input value={b.responsiveRequirements.desktop} onChange={(e) => set({ responsiveRequirements: { ...b.responsiveRequirements, desktop: e.target.value } })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-800">Mobile</span>
          <Input value={b.responsiveRequirements.mobile} onChange={(e) => set({ responsiveRequirements: { ...b.responsiveRequirements, mobile: e.target.value } })} />
        </label>
      </div>

      {result.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-800">
            Ideas from Claude <span className="font-normal text-slate-500">(off until you turn them on)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {result.suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.status === "accepted"}
                onClick={() => toggle(s)}
                className={cx(
                  "rounded border px-3 py-1.5 text-left text-sm transition",
                  s.status === "accepted" ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
                )}
              >
                <span className="sg-label mr-1.5 text-slate-500">{s.type}</span>
                {s.status === "accepted" ? "✓ " : "+ "}
                {s.description}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
        <Button onClick={onAccept} disabled={busy}>
          Use this brief and generate{accepted ? ` (${accepted} idea${accepted > 1 ? "s" : ""})` : ""}
        </Button>
        <Button variant="secondary" onClick={onRegenerate} disabled={busy}>
          {busy && <Spinner />} New suggestions
        </Button>
        <Button variant="ghost" onClick={onRevert} disabled={busy}>
          Revert to my prompt
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          Generate without enhancing
        </Button>
      </div>
    </Card>
  );
}
