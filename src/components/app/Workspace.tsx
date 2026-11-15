"use client";
import { authHeaders } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractLinks, fileToDataUrl } from "@/lib/images";
import { compileScene } from "@/lib/scene/compile";
import { findNode } from "@/lib/scene/ops";
import type { Scene } from "@/lib/scene/types";
import { store } from "@/lib/storage";
import { uid } from "@/lib/tokens";
import type { ChatImage, ChatMessage, Project, SavedSection, Section, SectionSpec, Variant } from "@/lib/types";
import { makeVersion, SectionEditor } from "../editor/SectionEditor";
import { Preview } from "../Preview";
import { Button, Card, Spinner, cx } from "../ui";
import { Shell } from "./Shell";

type VariantResult = { ok: true; variant: Variant } | { ok: false; direction: string; error: string };
type ChatResponse =
  | { type: "questions"; message: string; questions: string[] }
  | { type: "variants"; message: string; variants: VariantResult[]; brief?: Record<string, unknown>; spec: SectionSpec; title?: string }
  | { type: "refined"; message: string; scene: Scene; html: string; css: string; js: string; issues: string[] };

const STARTERS = [
  "A pricing section with 3 plans and a monthly/yearly toggle",
  "A hero for our product launch with a product screenshot and two CTAs",
  "An FAQ accordion with 6 questions about shipping and returns",
  "A testimonials carousel with star ratings",
];

function msg(role: ChatMessage["role"], text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: uid("m"), role, text, createdAt: Date.now(), ...extra };
}

function ChatBubble({ m, onPickQuestion }: { m: ChatMessage; onPickQuestion?: (q: string) => void }) {
  const mine = m.role === "user";
  const lines = m.text.split("\n");
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[90%] space-y-2 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          mine ? "rounded-br-sm bg-indigo-600 text-white" : m.kind === "error" ? "rounded-bl-sm bg-red-50 text-red-800" : "rounded-bl-sm bg-white text-slate-800 shadow-sm ring-1 ring-slate-200",
        )}
      >
        {m.focusNodeId && <p className={cx("text-xs", mine ? "text-indigo-100" : "text-slate-500")}>About the selected element</p>}
        {lines.map((l, i) =>
          l.startsWith("• ") && onPickQuestion ? (
            <p key={i} className="pl-1">
              {l}
            </p>
          ) : (
            <p key={i}>{l || " "}</p>
          ),
        )}
        {!!m.images?.length && (
          <div className="flex flex-wrap gap-1.5">
            {m.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={img.dataUrl} alt={img.name} className="h-16 w-16 rounded-md object-cover" />
            ))}
          </div>
        )}
        {!!m.links?.length && (
          <ul className="space-y-0.5 text-xs">
            {m.links.map((l) => (
              <li key={l} className="truncate">
                🔗 {l}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Workspace({ sectionId }: { sectionId: string }) {
  const [section, setSection] = useState<Section | null | undefined>(undefined);
  const [project, setProject] = useState<Project | null>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [busy, setBusy] = useState<false | "thinking" | "designing" | "refining">(false);
  const [view, setView] = useState<"options" | "editor">("editor");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const workingScene = useRef<Scene | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = await store.getSection(sectionId);
      const p = s ? await store.getProject(s.projectId) : null;
      if (!live) return;
      setSection(s);
      setProject(p);
    })();
    return () => {
      live = false;
    };
  }, [sectionId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [section?.messages.length, busy]);

  const persist = useCallback(async (s: Section) => {
    setSection(s);
    try {
      await store.saveSection(s);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onWorkingSceneChange = useCallback((s: Scene | undefined) => {
    workingScene.current = s;
    // Drop the target if the selected element no longer exists.
    setSelected((cur) => (cur && (!s || !findNode(s, cur.id)) ? null : cur));
  }, []);
  const onSelectionChange = useCallback((id: string | null) => {
    const node = id && workingScene.current ? findNode(workingScene.current, id) : undefined;
    setSelected(id && node ? { id, name: node.name || id } : null);
  }, []);

  if (section === undefined) return <Shell>Loading…</Shell>;
  if (!section || !project)
    return (
      <Shell>
        <p>
          This section doesn&apos;t exist.{" "}
          <Link href="/" className="text-indigo-600 underline">
            Go home
          </Link>
        </p>
      </Shell>
    );

  const hasDesign = section.versions.length > 0;
  const showOptions = !hasDesign || view === "options";
  const focus = hasDesign && view === "editor" && selected ? selected.id : undefined;
  const focusName = selected?.name ?? "";

  const send = async (opts: { action?: "auto" | "regenerate"; overrideText?: string } = {}) => {
    const body = (opts.overrideText ?? text).trim();
    if (busy || (!body && !images.length && opts.action !== "regenerate")) return;
    let next = section;
    if (opts.action !== "regenerate" || body) {
      const user = msg("user", body || "(reference images)", { images: images.length ? images : undefined, links: extractLinks(body), focusNodeId: focus });
      next = { ...section, messages: [...section.messages, user] };
      await persist(next);
    }
    setText("");
    setImages([]);
    const refining = hasDesign && view === "editor" && opts.action !== "regenerate";
    setBusy(refining ? "refining" : opts.action === "regenerate" ? "designing" : "thinking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          project,
          section: next,
          action: refining ? "auto" : opts.action === "regenerate" ? "regenerate" : "auto",
          scene: refining ? workingScene.current : undefined,
          focusNodeId: refining ? focus : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatResponse & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);

      if (data.type === "questions") {
        const q = data.questions.length ? `\n${data.questions.map((x) => `• ${x}`).join("\n")}` : "";
        await persist({ ...next, messages: [...next.messages, msg("assistant", data.message + q, { kind: "questions" })] });
      } else if (data.type === "variants") {
        const ok = data.variants.filter((v): v is { ok: true; variant: Variant } => v.ok).map((v) => v.variant);
        const failed = data.variants.filter((v) => !v.ok).length;
        const note = `${data.message}\nHere ${ok.length === 1 ? "is 1 option" : `are ${ok.length} options`} on the right. Pick one to open it in the editor.${failed ? ` (${failed} couldn't be generated.)` : ""}`;
        await persist({
          ...next,
          title: next.title.startsWith("Section ") || next.title === "Quick section" || next.title === "Untitled section" ? data.title || next.title : next.title,
          brief: data.brief ?? next.brief,
          spec: data.spec,
          variants: ok,
          messages: [...next.messages, msg("assistant", note, { kind: "variants" })],
        });
        setView("options");
      } else if (data.type === "refined") {
        const v = makeVersion({ html: data.html, css: data.css, js: data.js }, (focus ? `${focusName}: ` : "") + (body || "Chat change"), data.issues, data.scene);
        await persist({
          ...next,
          versions: [...next.versions, v],
          messages: [...next.messages, msg("assistant", `${data.message}\nSaved as v${next.versions.length + 1}.`, { kind: "refined" })],
        });
      }
    } catch (e) {
      await persist({ ...next, messages: [...next.messages, msg("assistant", e instanceof Error ? e.message : String(e), { kind: "error" })] });
    } finally {
      setBusy(false);
    }
  };

  const choose = async (v: Variant) => {
    const code = compileScene(v.scene, { rootClass: section.id });
    const version = makeVersion(code, `Picked "${v.name}" (${v.direction})`, v.issues, v.scene);
    await persist({
      ...section,
      versions: [...section.versions, version],
      messages: [
        ...section.messages,
        msg("assistant", `Opened “${v.name}” in the editor. Tell me what to change, or click any element in the preview to edit it directly. If an element is selected, my changes apply to just that element.`, { kind: "text" }),
      ],
    });
    setView("editor");
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 4 - images.length);
    const added = await Promise.all(list.map(async (f) => ({ name: f.name || "pasted image", dataUrl: await fileToDataUrl(f) })));
    setImages((prev) => [...prev, ...added].slice(0, 4));
  };

  const placeholder = !section.messages.length
    ? "Describe the section you need. Add reference images or links…"
    : hasDesign && view === "editor"
      ? focus
        ? "Describe a change to the selected element…"
        : "Describe a change, or click an element to target it…"
      : "Reply, or ask for changes to the brief…";

  return (
    <Shell
      wide
      crumbs={[
        project.kind === "blank" ? { label: "Quick sections" } : { label: project.name, href: `/p/${project.id}` },
        { label: section.title },
      ]}
      actions={
        project.kind === "project" ? (
          <Link href={`/p/${project.id}/settings`} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Design system
          </Link>
        ) : (
          <Link href={`/p/${project.id}/settings`} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Default design system
          </Link>
        )
      }
    >
      <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-[380px_1fr]">
        {/* Chat */}
        <aside className="flex flex-col border-slate-200 bg-slate-50 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:border-r" aria-label="Chat">
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {!section.messages.length && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Tell me what this section should do. I&apos;ll ask only if something important is missing, then design 3 options using{" "}
                  <strong>{project.designSystem.name}</strong>.
                </p>
                <div className="space-y-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => setText(s)} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-indigo-300">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {section.messages.map((m) => (
              <ChatBubble key={m.id} m={m} onPickQuestion={(q) => setText(q)} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner />
                {busy === "thinking" ? "Reading your brief…" : busy === "designing" ? "Designing 3 options…" : "Updating the design…"}
              </div>
            )}
          </div>

          <form
            className="border-t border-slate-200 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {focus && (
              <div className="mb-2 flex items-center justify-between rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
                <span>Targeting: {focusName}</span>
                <button type="button" className="underline" onClick={() => setSelected(null)}>
                  Whole section
                </button>
              </div>
            )}
            {!!images.length && (
              <div className="mb-2 flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.dataUrl} alt={img.name} className="h-14 w-14 rounded-md object-cover ring-1 ring-slate-200" />
                    <button
                      type="button"
                      aria-label={`Remove ${img.name}`}
                      onClick={() => setImages(images.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-xs text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                if (files.length) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              rows={3}
              aria-label="Message"
              placeholder={placeholder}
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <div className="mt-2 flex items-center justify-between">
              <div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
                <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => fileRef.current?.click()} disabled={images.length >= 4}>
                  + Images
                </Button>
                <span className="text-xs text-slate-400">Paste links in your message</span>
              </div>
              <Button type="submit" disabled={!!busy || (!text.trim() && !images.length)} className="px-3 py-1.5">
                Send
              </Button>
            </div>
          </form>
        </aside>

        {/* Designs */}
        <section className="min-w-0 p-4 lg:p-6" aria-label="Designs">
          {showOptions ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-lg font-semibold text-slate-900">{section.variants.length ? "Choose a design" : section.title}</h1>
                <div className="flex gap-2">
                  {hasDesign && (
                    <Button variant="secondary" onClick={() => setView("editor")}>
                      Back to the editor
                    </Button>
                  )}
                  {!!section.brief && (
                    <Button variant="secondary" onClick={() => send({ action: "regenerate" })} disabled={!!busy}>
                      3 new options
                    </Button>
                  )}
                </div>
              </div>
              {busy === "designing" || (busy === "thinking" && !section.variants.length) ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-80 animate-pulse rounded-xl bg-slate-200/70" />
                  ))}
                </div>
              ) : section.variants.length ? (
                <div className="grid gap-4 xl:grid-cols-3">
                  {section.variants.map((v) => (
                    <Card key={v.id} className="flex flex-col gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">{v.direction}</p>
                        <h2 className="font-semibold text-slate-900">{v.name}</h2>
                      </div>
                      <Preview code={v} designSystem={project.designSystem} rootClass={v.id} breakpoints={section.spec.breakpoints} compact />
                      <p className="text-sm text-slate-600">{v.rationale}</p>
                      {v.issues.length > 0 && <p className="text-xs text-amber-700">Quality check: {v.issues.length} issue(s), fixable in the editor.</p>}
                      <Button className="mt-auto" onClick={() => choose(v)}>
                        Use this design
                      </Button>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="grid min-h-80 place-items-center text-center">
                  <div className="max-w-md space-y-2">
                    <p className="font-medium text-slate-900">Your 3 designs will appear here</p>
                    <p className="text-sm text-slate-600">Describe the section in the chat. Reference images and links help Claude match the look you want.</p>
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <SectionEditor
              key={`${section.id}-${section.versions.length}`}
              section={section as SavedSection}
              designSystem={project.designSystem}
              onChange={(s) => persist({ ...section, ...s })}
              onBackToVariants={section.variants.length ? () => setView("options") : undefined}
              hideRefinePanel
              onWorkingSceneChange={onWorkingSceneChange}
              onSelectionChange={onSelectionChange}
            />
          )}
        </section>
      </div>
    </Shell>
  );
}
