"use client";
import type { DesignSystem, SavedSection } from "./types";

// Local-only storage for the MVP. Everything goes through these functions so a
// Supabase-backed implementation can replace them later without UI changes.
const DS_KEY = "sg.designSystems.v1";
const SECTIONS_KEY = "sg.sections.v1";

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
    // Storage full or blocked; the app keeps working in memory.
  }
}

export const listDesignSystems = () => read<DesignSystem>(DS_KEY).sort((a, b) => b.updatedAt - a.updatedAt);
export function saveDesignSystem(ds: DesignSystem) {
  write(DS_KEY, [{ ...ds, updatedAt: Date.now() }, ...read<DesignSystem>(DS_KEY).filter((d) => d.id !== ds.id)]);
}
export function deleteDesignSystem(id: string) {
  write(DS_KEY, read<DesignSystem>(DS_KEY).filter((d) => d.id !== id));
}

export const listSections = () => read<SavedSection>(SECTIONS_KEY).sort((a, b) => b.updatedAt - a.updatedAt);
export function saveSection(s: SavedSection) {
  write(SECTIONS_KEY, [{ ...s, updatedAt: Date.now() }, ...read<SavedSection>(SECTIONS_KEY).filter((x) => x.id !== s.id)]);
}
export function deleteSection(id: string) {
  write(SECTIONS_KEY, read<SavedSection>(SECTIONS_KEY).filter((x) => x.id !== id));
}
