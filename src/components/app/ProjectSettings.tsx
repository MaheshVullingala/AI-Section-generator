"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BUSINESS_TYPES } from "@/lib/catalog";
import { store } from "@/lib/storage";
import type { Project } from "@/lib/types";
import { DesignSystemEditor } from "../DesignSystemEditor";
import { Button, Card, Field, Input, Select, Textarea } from "../ui";
import { Shell } from "./Shell";

const CMS = ["Any / plain HTML", "WordPress (Custom HTML block)", "Webflow (Embed)", "Shopify (Custom Liquid)", "HubSpot", "Framer (Embed)", "Squarespace (Code block)"];

export function ProjectSettings({ projectId }: { projectId: string }) {
  const router = useRouter();
  const isNew = useSearchParams().get("new") === "1";
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    store.getProject(projectId).then((p) => live && setProject(p));
    return () => {
      live = false;
    };
  }, [projectId]);

  if (project === undefined) return <Shell>Loading…</Shell>;
  if (!project) return <Shell>Project not found.</Shell>;

  const patch = (p: Partial<Project>) => {
    setSaved(false);
    setProject({ ...project, ...p });
  };
  const save = async () => {
    await store.saveProject(project);
    setSaved(true);
    if (isNew) router.push(`/p/${project.id}`);
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${project.name}" and all its sections? This can't be undone.`)) return;
    await store.deleteProject(project.id);
    router.push("/");
  };
  const isBlank = project.kind === "blank";

  return (
    <Shell
      crumbs={[{ label: project.name, href: isBlank ? undefined : `/p/${project.id}` }, { label: "Settings" }]}
      actions={
        <>
          {saved && <span className="text-sm text-emerald-700">Saved</span>}
          <Button onClick={save}>{isNew ? "Save and continue" : "Save"}</Button>
        </>
      }
    >
      <div className="space-y-6">
        {isNew && (
          <p className="rounded-md bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            Set up this project&apos;s design system. Every section you create here will use it. You can change it any time.
          </p>
        )}
        {isBlank && (
          <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
            This is the default design system used by quick (blank) sections.
          </p>
        )}
        {!isBlank && (
          <Card className="grid gap-4 md:grid-cols-2">
            <Field label="Project name">
              <Input value={project.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Business or product type">
              <Select value={project.businessType} onChange={(e) => patch({ businessType: e.target.value })}>
                <option value="">Choose…</option>
                {BUSINESS_TYPES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Describe the business">
                <Textarea value={project.businessDescription} onChange={(e) => patch({ businessDescription: e.target.value })} />
              </Field>
            </div>
          </Card>
        )}

        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Design system</h2>
          <DesignSystemEditor value={project.designSystem} onChange={(designSystem) => patch({ designSystem })} />
        </div>

        <Card className="grid gap-4 md:grid-cols-2">
          <h2 className="font-semibold text-slate-900 md:col-span-2">Defaults for new designs</h2>
          <Field label="Accessibility target">
            <Select value={project.defaults.accessibility} onChange={(e) => patch({ defaults: { ...project.defaults, accessibility: e.target.value } })}>
              <option>WCAG 2.2 AA</option>
              <option>WCAG 2.2 AAA</option>
            </Select>
          </Field>
          <Field label="Where sections will be pasted">
            <Select value={project.defaults.targetCms} onChange={(e) => patch({ defaults: { ...project.defaults, targetCms: e.target.value } })}>
              {CMS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={project.defaults.allowJs} onChange={(e) => patch({ defaults: { ...project.defaults, allowJs: e.target.checked } })} />
            Allow JavaScript (uncheck for CSS-only sections)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={project.defaults.darkMode} onChange={(e) => patch({ defaults: { ...project.defaults, darkMode: e.target.checked } })} />
            Support dark mode
          </label>
        </Card>

        <div className="flex items-center justify-between">
          {!isBlank ? (
            <Button variant="danger" onClick={remove}>
              Delete project
            </Button>
          ) : (
            <Link href="/" className="text-sm text-slate-600 underline">
              Back home
            </Link>
          )}
          <Button onClick={save}>{isNew ? "Save and continue" : "Save"}</Button>
        </div>
      </div>
    </Shell>
  );
}
