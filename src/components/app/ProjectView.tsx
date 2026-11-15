"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { newSection, store } from "@/lib/storage";
import type { Project, Section } from "@/lib/types";
import { Preview } from "../Preview";
import { Button, Card } from "../ui";
import { Shell, Swatches, timeAgo } from "./Shell";

export function ProjectView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([store.getProject(projectId), store.listSections(projectId)]).then(([p, s]) => {
      if (!live) return;
      setProject(p);
      setSections(s);
    });
    return () => {
      live = false;
    };
  }, [projectId]);

  if (project === undefined) return <Shell>Loading…</Shell>;
  if (!project)
    return (
      <Shell>
        <p>This project doesn&apos;t exist. <Link href="/" className="text-indigo-600 underline">Go home</Link></p>
      </Shell>
    );

  const create = async () => {
    const s = newSection(project, `Section ${sections.length + 1}`);
    await store.saveSection(s);
    router.push(`/s/${s.id}`);
  };

  return (
    <Shell
      crumbs={[{ label: project.name }]}
      actions={
        <>
          <Link href={`/p/${project.id}/settings`} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Design system & settings
          </Link>
          <Button onClick={create}>New section</Button>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">
            {project.businessType || "Business type not set"} · {project.designSystem.name}
          </p>
        </div>
        <Swatches colors={project.designSystem.colors} max={8} />
      </div>

      {sections.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-slate-700">No sections yet. Start one and describe what you need in the chat.</p>
          <Button onClick={create}>Create a section</Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => {
            const v = s.versions[s.versions.length - 1];
            return (
              <Link key={s.id} href={`/s/${s.id}`} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md">
                <div className="pointer-events-none h-48 overflow-hidden border-b border-slate-100 bg-slate-50 p-2">
                  {v ? (
                    <Preview code={v} designSystem={project.designSystem} rootClass={s.id} breakpoints={project.designSystem.breakpoints} compact />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-slate-400">{s.variants.length ? "3 options to choose from" : "No design yet"}</div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-medium text-slate-900 group-hover:text-indigo-700">{s.title}</h2>
                  <p className="text-xs text-slate-500">
                    {s.versions.length ? `v${s.versions.length}` : "In progress"} · {timeAgo(s.updatedAt)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
