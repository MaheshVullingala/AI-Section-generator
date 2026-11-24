"use client";
import { publishAllowance } from "@/lib/allowance";
import { authHeaders } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { checkSection, fixIssuesInstruction } from "@/lib/check";
import { compileScene } from "@/lib/scene/compile";
import { duplicateNode, findNode, findParent, moveNode, removeNode, updateNode } from "@/lib/scene/ops";
import type { Scene } from "@/lib/scene/types";
import { uid } from "@/lib/tokens";
import type { Allowance, DesignSystem, SavedSection, SectionCode, SectionVersion } from "@/lib/types";
import { ExportPanel } from "../ExportPanel";
import { Preview } from "../Preview";
import { Button, Card, Spinner, Textarea, cx } from "../ui";
import { Inspector } from "./Inspector";
import { Layers } from "./Layers";

const QUICK_ACTIONS = [
  "Improve the mobile layout",
  "Increase contrast and readability",
  "Tighten spacing",
  "Add tasteful motion",
  "Run an accessibility pass and fix issues",
  "Make the copy shorter and punchier",
  "Make the primary CTA more prominent",
];

export function makeVersion(code: SectionCode, instruction: string, issues: string[] = [], scene?: Scene): SectionVersion {
  return { id: uid("v"), scene, html: code.html, css: code.css, js: code.js, instruction, issues, createdAt: Date.now() };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  publishAllowance((data as { allowance?: Allowance }).allowance);
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

function Issues({ issues }: { issues: string[] }) {
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

/**
 * The editing workspace: preview with click-to-select, layers, inspector, Claude refinements,
 * version history and export. Manual edits collect in a draft with undo/redo until saved as a version.
 */
export function SectionEditor({
  section,
  designSystem,
  onChange,
  onBackToVariants,
  initialVersion,
  hideRefinePanel,
  onWorkingSceneChange,
  onSelectionChange,
}: {
  section: SavedSection;
  designSystem: DesignSystem;
  onChange: (s: SavedSection) => void;
  onBackToVariants?: () => void;
  initialVersion?: number;
  /** When a chat drives refinements, the built-in refine panel is hidden. */
  hideRefinePanel?: boolean;
  /** Reports the design on screen, including unsaved edits. */
  onWorkingSceneChange?: (scene: Scene | undefined) => void;
  onSelectionChange?: (id: string | null) => void;
}) {
  const [versionIdx, setVersionIdx] = useState(initialVersion ?? section.versions.length - 1);
  const [history, setHistory] = useState<Scene[]>([]); // draft states; last is current
  const [future, setFuture] = useState<Scene[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "interact">("edit");
  const [panel, setPanel] = useState<"design" | "refine">("design");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const version = section.versions[versionIdx];
  const scene = history.length ? history[history.length - 1] : version.scene;
  const dirty = history.length > 0;
  const rootClass = section.id;

  const code = useMemo<SectionCode>(() => (scene ? compileScene(scene, { rootClass }) : version), [scene, rootClass, version]);
  const editorCode = useMemo<SectionCode | null>(() => (scene ? compileScene(scene, { rootClass, editor: true }) : null), [scene, rootClass]);
  const issues = useMemo(() => (dirty ? checkSection(code, rootClass, section.spec) : (version.issues ?? [])), [dirty, code, rootClass, section.spec, version.issues]);
  const selected = scene && selectedId ? findNode(scene, selectedId) : null;

  useEffect(() => onWorkingSceneChange?.(scene), [scene, onWorkingSceneChange]);
  useEffect(() => onSelectionChange?.(selected ? selected.id : null), [selected, onSelectionChange]);

  const edit = (next: Scene) => {
    setHistory((h) => [...h.slice(-49), next]);
    setFuture([]);
  };
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [history[history.length - 1], ...f]);
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, future[0]]);
    setFuture((f) => f.slice(1));
  };

  const commit = (s: Scene, label: string, newIssues?: string[]) => {
    const compiled = compileScene(s, { rootClass });
    const v = makeVersion(compiled, label, newIssues ?? checkSection(compiled, rootClass, section.spec), s);
    // Saving from an older version drops the versions after it, like undo/redo.
    const versions = [...section.versions.slice(0, versionIdx + 1), v];
    onChange({ ...section, versions });
    setVersionIdx(versions.length - 1);
    setHistory([]);
    setFuture([]);
  };

  const askClaude = async (text: string, focusNodeId?: string) => {
    if (!scene || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await postJson<{ scene: Scene; issues: string[] }>("/api/refine", {
        designSystem,
        spec: section.spec,
        rootClass,
        scene,
        instruction: text,
        focusNodeId,
      });
      const label = text.startsWith("Fix these issues")
        ? "Fix quality-check issues"
        : focusNodeId
          ? `${findNode(scene, focusNodeId)?.name || focusNodeId}: ${text}`
          : text;
      commit(res.scene, label, res.issues);
      if (focusNodeId && !findNode(res.scene, focusNodeId)) setSelectedId(null);
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setPanel("design");
  }, []);
  const editorBinding = useMemo(() => ({ selectedId, onSelect }), [selectedId, onSelect]);

  const switchVersion = (i: number) => {
    if (dirty && !window.confirm("Discard your unsaved edits?")) return;
    setHistory([]);
    setFuture([]);
    setVersionIdx(i);
  };

  const modeToggle = scene ? (
    <div className="mr-2 inline-flex rounded-md border border-slate-300 bg-white p-0.5" role="group" aria-label="Preview mode">
      {(["edit", "interact"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={cx("rounded px-2.5 py-1 text-sm", mode === m ? "bg-indigo-600 text-white" : "text-slate-700")}
        >
          {m === "edit" ? "Select & edit" : "Try it"}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {scene && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="secondary" className="px-2.5 py-1" onClick={undo} disabled={!history.length}>
              Undo
            </Button>
            <Button variant="secondary" className="px-2.5 py-1" onClick={redo} disabled={!future.length}>
              Redo
            </Button>
            {dirty && (
              <>
                <span className="text-amber-700">Unsaved edits</span>
                <Button className="px-2.5 py-1" onClick={() => commit(scene, "Manual edits")}>
                  Save as new version
                </Button>
                <Button variant="ghost" className="px-2.5 py-1" onClick={() => switchVersion(versionIdx)}>
                  Discard
                </Button>
              </>
            )}
          </div>
        )}
        <Preview
          code={mode === "edit" && editorCode ? editorCode : code}
          designSystem={designSystem}
          rootClass={rootClass}
          breakpoints={section.spec.breakpoints}
          editor={mode === "edit" && scene ? editorBinding : undefined}
          toolbarExtra={modeToggle}
        />
        {!scene && (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
            This version was made before the visual editor, so it can only be refined with Claude. Any refinement creates an editable version.
          </p>
        )}
        <ExportPanel code={code} designSystem={designSystem} rootClass={rootClass} title={section.title} />
      </div>

      <aside className="space-y-4">
        {issues.length > 0 && (
          <Card className="space-y-3">
            <Issues issues={issues} />
            <Button variant="secondary" className="w-full" disabled={busy || !scene} onClick={() => askClaude(fixIssuesInstruction(issues))}>
              {busy && <Spinner />} Fix these with Claude
            </Button>
          </Card>
        )}

        {!hideRefinePanel && (
        <div className="flex gap-1 rounded-lg bg-slate-200 p-1" role="tablist">
          {(
            [
              ["design", "Design"],
              ["refine", "Refine with Claude"],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              role="tab"
              aria-selected={panel === p}
              onClick={() => setPanel(p)}
              className={cx("flex-1 rounded-md py-1.5 text-sm font-medium", panel === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
            >
              {label}
            </button>
          ))}
        </div>
        )}

        {(panel === "design" || hideRefinePanel) && scene && (
          <>
            <Card className="space-y-2 p-3">
              <h3 className="text-sm font-semibold text-slate-900">Layers</h3>
              <Layers scene={scene} selectedId={selectedId} onSelect={onSelect} onMove={(id, dir) => edit(moveNode(scene, id, dir))} />
            </Card>
            <Card className="p-4">
              {selected ? (
                <Inspector
                  key={selected.id}
                  node={selected}
                  isRoot={selected.id === scene.root.id}
                  breakpoints={section.spec.breakpoints}
                  onChange={(n) => edit(updateNode(scene, selected.id, () => n))}
                  onDuplicate={() => {
                    const r = duplicateNode(scene, selected.id);
                    edit(r.scene);
                    if (r.newId) setSelectedId(r.newId);
                  }}
                  onDelete={() => {
                    const parent = findParent(scene, selected.id);
                    edit(removeNode(scene, selected.id));
                    setSelectedId(parent?.id ?? null);
                  }}
                  onAskClaude={(text) => askClaude(text, selected.id)}
                  asking={busy}
                />
              ) : (
                <p className="text-sm text-slate-600">Click any element in the preview, or pick a layer, to edit it.</p>
              )}
            </Card>
          </>
        )}

        {!hideRefinePanel && (panel === "refine" || !scene) && (
          <Card className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a}
                  disabled={busy || !scene}
                  onClick={() => askClaude(a)}
                  className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-400 disabled:opacity-50"
                >
                  {a}
                </button>
              ))}
            </div>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Describe a change to the whole section, e.g. add a yearly billing toggle with a 20% discount badge"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) askClaude(instruction);
              }}
            />
            <Button onClick={() => askClaude(instruction)} disabled={busy || !instruction.trim() || !scene} className="w-full">
              {busy && <Spinner />} {busy ? "Applying change…" : "Apply change"}
            </Button>
          </Card>
        )}

        <Card className="space-y-2">
          <h3 className="font-semibold text-slate-900">Versions</h3>
          <ol className="max-h-64 space-y-1 overflow-auto">
            {section.versions.map((v, i) => (
              <li key={v.id}>
                <button
                  onClick={() => switchVersion(i)}
                  className={cx("w-full rounded-md px-2 py-1.5 text-left text-sm", i === versionIdx ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-50")}
                >
                  <span className="font-medium">v{i + 1}</span> · {v.instruction}
                  {v.meta && (
                    <span
                      className="sg-label ml-1.5 rounded bg-slate-100 px-1 text-slate-500"
                      title={[
                        v.meta.edit.intent,
                        `${v.meta.diff.changed.length} changed, ${v.meta.diff.added.length} added, ${v.meta.diff.removed.length} removed`,
                        v.meta.edit.viewports.includes("all") ? "" : `Only: ${v.meta.edit.viewports.join(", ")}`,
                        v.meta.author ? `By ${v.meta.author}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {v.meta.edit.category}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </Card>
        {onBackToVariants && (
          <Button variant="secondary" className="w-full" onClick={onBackToVariants}>
            See the 3 options again
          </Button>
        )}
      </aside>
    </div>
  );
}
