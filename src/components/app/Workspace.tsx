"use client";
import { authHeaders } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractLinks, fileToDataUrl } from "@/lib/images";
import { compileScene } from "@/lib/scene/compile";
import { findNode } from "@/lib/scene/ops";
import type { Scene } from "@/lib/scene/types";
import { store } from "@/lib/storage";
import { VARIANT_DIRECTIONS } from "@/lib/catalog";
import { uid } from "@/lib/tokens";
import type { ChatImage, ChatMessage, Project, SavedSection, Section, SectionSpec, Variant } from "@/lib/types";
import { makeVersion, SectionEditor } from "../editor/SectionEditor";
import { Preview } from "../Preview";
import { Button, Card, Waveform, cx } from "../ui";
import { Shell } from "./Shell";

type VariantResult = { ok: true; variant: Variant } | { ok: false; direction: string; error: string };
type ChatResponse =
  | { type: "questions"; message: string; questions: string[] }
  | { type: "brief"; message: string; brief: Record<string, unknown>; spec: SectionSpec; title?: string }
  | { type: "variants"; message: string; variants: VariantResult[]; brief?: Record<string, unknown>; spec: SectionSpec; title?: string }
  | { type: "refined"; message: string; scene: Scene; html: string; css: string; js: string; issues: string[] };

const STARTERS = [
  "A pricing section with 3 plans and a monthly/yearly toggle",
  "A hero for our product launch with a product screenshot and two CTAs",
  "An FAQ accordion with 6 questions about shipping and returns",
  "A testimonials carousel with star ratings",
];

/** Longest we wait for one chat request before showing an error. Each design is its own request. */
const TIMEOUTS = { thinking: 3 * 60_000, designing: 6 * 60_000, refining: 6 * 60_000 } as const;

/**
 * The 2nd and 3rd designs start this long after the 1st. They share the design system,
 * brief and images with it, and a prompt cache entry can only be read once the first
 * request has started answering, so a short head start lets them pay the cached rate.
 */
const CACHE_HEAD_START_MS = 6_000;

const PREMIUM_KEY = "forma.premium";

/** Claude only sees the newest reference images (see /api/chat), so older ones aren't uploaded. */
const MAX_SENT_IMAGES = 4;

/**
 * The section as the server needs it. Hosts cap request size (4.5 MB on Vercel),
 * so leave out saved versions and designs, and blank all but the newest images.
 * Blanked images stay in the list so the server can still say how many there were.
 */
function slimSection(s: Section): Section {
  const last = s.messages[s.messages.length - 1];
  let budget = MAX_SENT_IMAGES;
  const keep = new Set<ChatImage>(last?.images ?? []);
  for (let i = s.messages.length - 1; i >= 0 && budget > 0; i--) {
    const m = s.messages[i];
    if (m.role !== "user" || !m.images) continue;
    for (let j = m.images.length - 1; j >= 0 && budget > 0; j--, budget--) keep.add(m.images[j]);
  }
  return {
    ...s,
    versions: [],
    variants: [],
    messages: s.messages.map((m) => (m.images ? { ...m, images: m.images.map((img) => (keep.has(img) ? img : { ...img, dataUrl: "" })) } : m)),
  };
}

async function callChat(payload: { section: Section } & Record<string, unknown>, timeoutMs: number): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ ...payload, section: slimSection(payload.section) }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as ChatResponse & { error?: string };
    if (!res.ok || data.error) {
      if (res.status === 413) throw new Error("That message is too large to send. Try fewer or smaller images.");
      if (res.status === 504) throw new Error("The server ran out of time on this request. Try again, or ask for a smaller change.");
      throw new Error(data.error || `Request failed (${res.status}). Check the server logs for details.`);
    }
    return data;
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error(`No answer after ${Math.round(timeoutMs / 60_000)} minutes, so I stopped waiting. Check the server logs for errors, then try again.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Seconds since the component mounted, updated every second. */
function Elapsed() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - start) / 1000);
  return <span className="tabular-nums text-slate-400">{s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`}</span>;
}

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
          "max-w-[92%] space-y-2 rounded-sm border-l-2 px-3.5 py-2.5 text-sm leading-relaxed",
          mine ? "border-amber-700 bg-slate-100 text-slate-900" : m.kind === "error" ? "border-red-600 bg-red-50 text-red-800" : "border-indigo-600 bg-white text-slate-800",
        )}
      >
        <p className="sg-label">{mine ? "You" : m.kind === "error" ? "Error" : "Claude"}</p>
        {m.focusNodeId && <p className="sg-label text-amber-700">About the selected element</p>}
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

function VariantCard({ variant: v, project, section, onChoose, disabled }: { variant: Variant; project: Project; section: Section; onChoose?: () => void; disabled?: boolean }) {
  return (
    <Card lock className="flex flex-col gap-3 p-4">
      <div>
        <p className="sg-label text-indigo-600">{v.direction}</p>
        <h2 className="font-semibold text-slate-900">{v.name}</h2>
      </div>
      <Preview code={v} designSystem={project.designSystem} rootClass={v.id} breakpoints={section.spec.breakpoints} compact />
      <p className="text-sm text-slate-600">{v.rationale}</p>
      {v.issues.length > 0 && <p className="text-xs text-amber-700">Quality check: {v.issues.length} issue(s), fixable in the editor.</p>}
      <Button className="mt-auto" onClick={onChoose} disabled={disabled}>
        {onChoose ? "Use this design" : "Waiting for the others…"}
      </Button>
    </Card>
  );
}

export function Workspace({ sectionId }: { sectionId: string }) {
  const [section, setSection] = useState<Section | null | undefined>(undefined);
  const [project, setProject] = useState<Project | null>(null);
  const [text, setText] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [busy, setBusy] = useState<false | "thinking" | "designing" | "refining">(false);
  const [view, setView] = useState<"options" | "editor">("editor");
  /** Designs that have arrived while the others are still generating. */
  const [partial, setPartial] = useState<Variant[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  // Premium (Opus) is off by default and remembered per browser. The composer only
  // renders after the section loads in the browser, so reading storage here is safe.
  const [premium, setPremium] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(PREMIUM_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setPremiumPref = (on: boolean) => {
    setPremium(on);
    try {
      localStorage.setItem(PREMIUM_KEY, on ? "1" : "0");
    } catch {}
  };
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

  /** Asks for each design in its own request, shows each one as it arrives, then saves them. */
  const showDesigns = async (next: Section) => {
    setPartial([]);
    const arrived: Variant[] = [];
    const errors: string[] = [];
    let spec = next.spec;
    await Promise.all(
      VARIANT_DIRECTIONS.map(async (d, i) => {
        try {
          if (i > 0) await new Promise((r) => setTimeout(r, CACHE_HEAD_START_MS));
          const data = await callChat({ project, section: next, action: "regenerate", direction: d.id, premium }, TIMEOUTS.designing);
          if (data.type !== "variants") throw new Error("Unexpected reply from the server.");
          spec = data.spec;
          for (const v of data.variants) {
            if (v.ok) arrived.push(v.variant);
            else errors.push(v.error);
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
        setPartial([...arrived]);
      }),
    );
    setPartial([]);
    // Keep the designs in direction order, whatever order they arrived in.
    const order = VARIANT_DIRECTIONS.map((d) => d.label);
    arrived.sort((a, b) => order.indexOf(a.direction) - order.indexOf(b.direction));
    if (!arrived.length) throw new Error(errors[0] || "No designs could be generated. Try again.");
    const note = `Here ${arrived.length === 1 ? "is 1 option" : `are ${arrived.length} options`} on the right. Pick one to open it in the editor.${errors.length ? ` (${errors.length} couldn't be generated.)` : ""}`;
    await persist({ ...next, spec, variants: arrived, messages: [...next.messages, msg("assistant", note, { kind: "variants" })] });
    setView("options");
  };

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
    const stage = refining ? "refining" : opts.action === "regenerate" ? "designing" : "thinking";
    try {
      if (opts.action === "regenerate" && !refining) {
        await showDesigns(next);
        return;
      }
      const data = await callChat(
        {
          project,
          section: next,
          action: "auto",
          scene: refining ? workingScene.current : undefined,
          focusNodeId: refining ? focus : undefined,
          premium,
        },
        TIMEOUTS[stage],
      );

      if (data.type === "brief") {
        // Show the brief reply, then ask for the 3 designs in a second request.
        const title = next.title.startsWith("Section ") || next.title === "Quick section" || next.title === "Untitled section" ? data.title || next.title : next.title;
        next = { ...next, title, brief: data.brief, spec: data.spec, messages: [...next.messages, msg("assistant", data.message, { kind: "text" })] };
        await persist(next);
        setBusy("designing");
        await showDesigns(next);
      } else if (data.type === "questions") {
        const q = data.questions.length ? `\n${data.questions.map((x) => `• ${x}`).join("\n")}` : "";
        await persist({ ...next, messages: [...next.messages, msg("assistant", data.message + q, { kind: "questions" })] });
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
          <Link href={`/p/${project.id}/settings`} className="rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-indigo-600">
            Design system
          </Link>
        ) : (
          <Link href={`/p/${project.id}/settings`} className="rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-100 hover:text-indigo-600">
            Default design system
          </Link>
        )
      }
    >
      <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-[380px_1fr]">
        {/* Chat */}
        <aside className="flex flex-col border-slate-200 bg-slate-50/90 backdrop-blur lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:border-r" aria-label="Chat">
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {!section.messages.length && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Tell me what this section should do. I&apos;ll ask only if something important is missing, then design 3 options using{" "}
                  <strong>{project.designSystem.name}</strong>.
                </p>
                <div className="space-y-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => setText(s)} className="block w-full rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-indigo-600 hover:text-slate-900">
                      <span className="mr-1.5 font-mono text-indigo-600" aria-hidden>&gt;</span>
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
                <Waveform className="h-5 w-14 shrink-0" />
                <span>{busy === "thinking" ? "Reading your brief…" : busy === "designing" ? `Designing 3 options, ${partial.length} of 3 ready (usually 1 to 3 minutes)…` : "Updating the design…"}</span>
                <Elapsed key={busy} />
              </div>
            )}
          </div>

          <form
            className="border-t border-slate-200 bg-slate-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {focus && (
              <div className="mb-2 flex items-center justify-between rounded bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-800">
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
              className="w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 font-mono text-[13px] placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <div className="mt-2 flex items-center justify-between">
              <div>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
                <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => fileRef.current?.click()} disabled={images.length >= 4}>
                  + Images
                </Button>
                <span className="sg-label">Paste links in your message</span>
              </div>
              <label
                className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600"
                title="Premium uses Claude Opus for designs and changes. It can give stronger results and costs about twice as much."
              >
                <input type="checkbox" checked={premium} onChange={(e) => setPremiumPref(e.target.checked)} className="accent-amber-600" />
                Premium
              </label>
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
                <h1 className="text-xl font-semibold text-slate-900">
                  {section.variants.length ? (
                    <>
                      Choose a design <span className="sg-label ml-2 align-middle text-indigo-600">select [1–3]</span>
                    </>
                  ) : (
                    section.title
                  )}
                </h1>
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
                <div className="grid gap-4 xl:grid-cols-3">
                  {partial.map((v) => (
                    <VariantCard key={v.id} variant={v} project={project} section={section} disabled />
                  ))}
                  {Array.from({ length: Math.max(0, VARIANT_DIRECTIONS.length - partial.length) }, (_, i) => (
                    <div key={i} className="sg-scan flex h-80 flex-col items-center justify-center gap-3 rounded-md border border-slate-200 bg-white">
                      <Waveform className="h-16 w-3/4" />
                      <span className="sg-label text-amber-700">Generating…</span>
                    </div>
                  ))}
                </div>
              ) : section.variants.length ? (
                <div className="grid gap-4 xl:grid-cols-3">
                  {section.variants.map((v) => (
                    <VariantCard key={v.id} variant={v} project={project} section={section} onChoose={() => choose(v)} disabled={!!busy} />
                  ))}
                </div>
              ) : (
                <Card className="grid min-h-80 place-items-center border-dashed text-center">
                  <div className="max-w-md space-y-2">
                    <p className="sg-label text-indigo-600">Awaiting input</p>
                    <p className="font-display text-lg font-semibold text-slate-900">Your 3 designs will appear here</p>
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
