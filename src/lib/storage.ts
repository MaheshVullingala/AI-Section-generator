"use client";
import { sg, supabase } from "./supabase";
import { emptyDesignSystem, uid } from "./tokens";
import type { Project, Section, SectionSpec } from "./types";

/**
 * Storage for projects and sections. The UI only talks to the `Store` interface,
 * so the local implementation below can be swapped for a shared (Supabase) one.
 */
export interface Store {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(p: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listSections(projectId?: string): Promise<Section[]>;
  getSection(id: string): Promise<Section | null>;
  saveSection(s: Section): Promise<void>;
  deleteSection(id: string): Promise<void>;
}

const P_KEY = "sg.projects.v2";
const S_KEY = "sg.sections.v2";

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    throw new Error("Browser storage is full. Delete some sections or reference images and try again.");
  }
}
const byUpdated = <T extends { updatedAt: number }>(a: T, b: T) => b.updatedAt - a.updatedAt;

export const localStore: Store = {
  async listProjects() {
    return read<Project>(P_KEY).sort(byUpdated);
  },
  async getProject(id) {
    return read<Project>(P_KEY).find((p) => p.id === id) ?? null;
  },
  async saveProject(p) {
    write(P_KEY, [{ ...p, updatedAt: Date.now() }, ...read<Project>(P_KEY).filter((x) => x.id !== p.id)]);
  },
  async deleteProject(id) {
    write(P_KEY, read<Project>(P_KEY).filter((x) => x.id !== id));
    write(S_KEY, read<Section>(S_KEY).filter((x) => x.projectId !== id));
  },
  async listSections(projectId) {
    return read<Section>(S_KEY)
      .filter((s) => !projectId || s.projectId === projectId)
      .sort(byUpdated);
  },
  async getSection(id) {
    return read<Section>(S_KEY).find((s) => s.id === id) ?? null;
  },
  async saveSection(s) {
    write(S_KEY, [{ ...s, updatedAt: Date.now() }, ...read<Section>(S_KEY).filter((x) => x.id !== s.id)]);
  },
  async deleteSection(id) {
    write(S_KEY, read<Section>(S_KEY).filter((x) => x.id !== id));
  },
};

/** Rows hold the whole object as jsonb, plus a few columns for listing and filtering. */
type Row<T> = { data: T };
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Shared store in the section_gen schema of content-intake's Supabase project. */
export const supabaseStore: Store = {
  async listProjects() {
    return check(await sg().from("projects").select("data").order("updated_at", { ascending: false }))!.map((r: Row<Project>) => r.data);
  },
  async getProject(id) {
    return (check(await sg().from("projects").select("data").eq("id", id).maybeSingle()) as Row<Project> | null)?.data ?? null;
  },
  async saveProject(p) {
    const data = { ...p, updatedAt: Date.now() };
    check(await sg().from("projects").upsert({ id: p.id, kind: p.kind, name: p.name, data }));
  },
  async deleteProject(id) {
    check(await sg().from("projects").delete().eq("id", id)); // sections cascade
  },
  async listSections(projectId) {
    let q = sg().from("sections").select("data").order("updated_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    return check(await q)!.map((r: Row<Section>) => r.data);
  },
  async getSection(id) {
    return (check(await sg().from("sections").select("data").eq("id", id).maybeSingle()) as Row<Section> | null)?.data ?? null;
  },
  async saveSection(s) {
    const data = { ...s, updatedAt: Date.now() };
    check(await sg().from("sections").upsert({ id: s.id, project_id: s.projectId, title: s.title, data }));
  },
  async deleteSection(id) {
    check(await sg().from("sections").delete().eq("id", id));
  },
};

/** The store the app uses: shared Supabase when configured, otherwise this browser only. */
export const store: Store = supabase ? supabaseStore : localStore;

export function newProject(name: string, kind: Project["kind"] = "project"): Project {
  const now = Date.now();
  return {
    id: uid("p"),
    name,
    kind,
    businessType: "",
    businessDescription: "",
    designSystem: emptyDesignSystem(kind === "blank" ? "Default" : `${name} design system`),
    defaults: { accessibility: "WCAG 2.2 AA", targetCms: "Any / plain HTML", allowJs: true, darkMode: false },
    createdAt: now,
    updatedAt: now,
  };
}

export function specForProject(project: Project): SectionSpec {
  return {
    businessType: project.businessType,
    businessDescription: project.businessDescription,
    sectionType: "Custom",
    answers: {},
    followUps: [],
    content: { mode: "generate", copy: "", images: "", ctas: "" },
    interactions: [],
    extraInteractionNotes: "",
    constraints: { ...project.defaults },
    breakpoints: project.designSystem.breakpoints,
  };
}

export function newSection(project: Project, title = "Untitled section"): Section {
  return {
    id: uid("sg").replace("_", "-"),
    projectId: project.id,
    title,
    designSystemId: project.designSystem.id,
    spec: specForProject(project),
    versions: [],
    messages: [],
    variants: [],
    updatedAt: Date.now(),
  };
}

/** The shared "Quick sections" project that holds blank sections. */
export async function blankProject(): Promise<Project> {
  const existing = (await store.listProjects()).find((p) => p.kind === "blank");
  if (existing) return existing;
  const p = newProject("Quick sections", "blank");
  await store.saveProject(p);
  return p;
}
