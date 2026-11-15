"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BUSINESS_TYPES } from "@/lib/catalog";
import { blankProject, newProject, newSection, store } from "@/lib/storage";
import type { Project, Section } from "@/lib/types";
import { Button, Card, Field, Input, Select, Textarea } from "../ui";
import { Shell, Swatches, timeAgo } from "./Shell";

export function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", businessType: "", businessDescription: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([store.listProjects(), store.listSections()])
      .then(([p, s]) => {
        if (!live) return;
        setProjects(p);
        setSections(s);
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, []);

  const createProject = async () => {
    const p = { ...newProject(draft.name.trim() || "Untitled project"), businessType: draft.businessType, businessDescription: draft.businessDescription };
    await store.saveProject(p);
    router.push(`/p/${p.id}/settings?new=1`);
  };

  const createBlank = async () => {
    try {
      const p = await blankProject();
      const s = newSection(p, "Quick section");
      await store.saveSection(s);
      router.push(`/s/${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const real = (projects ?? []).filter((p) => p.kind === "project");
  const blank = (projects ?? []).find((p) => p.kind === "blank");
  const quick = blank ? sections.filter((s) => s.projectId === blank.id) : [];
  const count = (id: string) => sections.filter((s) => s.projectId === id).length;

  return (
    <Shell
      actions={
        <>
          <Button variant="secondary" onClick={createBlank}>
            Blank section
          </Button>
          <Button onClick={() => setCreating(true)}>New project</Button>
        </>
      }
    >
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {creating && (
        <Card className="mb-8 max-w-2xl space-y-4">
          <h2 className="font-semibold text-slate-900">New project</h2>
          <Field label="Project name">
            <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Acme website relaunch" />
          </Field>
          <Field label="Business or product type">
            <Select value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value })}>
              <option value="">Choose…</option>
              {BUSINESS_TYPES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Describe the business" help="What it sells, who it's for, what makes it different. Used for every section in this project.">
            <Textarea value={draft.businessDescription} onChange={(e) => setDraft({ ...draft, businessDescription: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Button onClick={createProject}>Create and set up design system</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="projects-h" className="space-y-4">
        <h1 id="projects-h" className="text-xl font-semibold text-slate-900">
          Projects
        </h1>
        {projects === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : real.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-slate-700">No projects yet. A project holds a design system and all the sections for one site or brand.</p>
            <div className="flex gap-2">
              <Button onClick={() => setCreating(true)}>Create your first project</Button>
              <Button variant="secondary" onClick={createBlank}>
                Or start a blank section
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {real.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900 group-hover:text-indigo-700">{p.name}</h2>
                  <Swatches colors={p.designSystem.colors} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{p.businessType || "Business type not set"}</p>
                <p className="mt-4 text-xs text-slate-500">
                  {count(p.id)} section{count(p.id) === 1 ? "" : "s"} · updated {timeAgo(p.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {quick.length > 0 && (
        <section aria-labelledby="quick-h" className="mt-10 space-y-3">
          <h2 id="quick-h" className="text-lg font-semibold text-slate-900">
            Quick sections
          </h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {quick.map((s) => (
              <li key={s.id}>
                <Link href={`/s/${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50">
                  <span className="font-medium text-slate-800">{s.title}</span>
                  <span className="text-slate-500">{timeAgo(s.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
