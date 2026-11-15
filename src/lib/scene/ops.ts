import type { Scene, SceneNode } from "./types";

export function findNode(scene: Scene, id: string): SceneNode | null {
  let found: SceneNode | null = null;
  const visit = (n: SceneNode) => {
    if (found) return;
    if (n.id === id) found = n;
    else n.children?.forEach(visit);
  };
  visit(scene.root);
  return found;
}

export function findParent(scene: Scene, id: string): SceneNode | null {
  let parent: SceneNode | null = null;
  const visit = (n: SceneNode) => {
    if (parent) return;
    if (n.children?.some((c) => c.id === id)) parent = n;
    else n.children?.forEach(visit);
  };
  visit(scene.root);
  return parent;
}

/** Ids from the root to the node, inclusive. */
export function pathTo(scene: Scene, id: string): string[] {
  const path: string[] = [];
  const visit = (n: SceneNode): boolean => {
    path.push(n.id);
    if (n.id === id) return true;
    for (const c of n.children ?? []) if (visit(c)) return true;
    path.pop();
    return false;
  };
  visit(scene.root);
  return path;
}

function mapTree(n: SceneNode, fn: (n: SceneNode) => SceneNode | null): SceneNode | null {
  const mapped = fn(n);
  if (!mapped) return null;
  if (!mapped.children) return mapped;
  const children = mapped.children.map((c) => mapTree(c, fn)).filter((c): c is SceneNode => !!c);
  return { ...mapped, children };
}

/** Immutable update of one node. */
export function updateNode(scene: Scene, id: string, fn: (n: SceneNode) => SceneNode): Scene {
  return { ...scene, root: mapTree(scene.root, (n) => (n.id === id ? fn(n) : n))! };
}

export function removeNode(scene: Scene, id: string): Scene {
  if (scene.root.id === id) return scene;
  return { ...scene, root: mapTree(scene.root, (n) => (n.id === id ? null : n))! };
}

function allIds(scene: Scene): Set<string> {
  const ids = new Set<string>();
  const visit = (n: SceneNode) => {
    ids.add(n.id);
    n.children?.forEach(visit);
  };
  visit(scene.root);
  return ids;
}

function cloneWithNewIds(n: SceneNode, taken: Set<string>): SceneNode {
  let id = `${n.id}-copy`;
  let i = 2;
  while (taken.has(id)) id = `${n.id}-copy${i++}`;
  taken.add(id);
  return { ...structuredClone(n), id, children: n.children?.map((c) => cloneWithNewIds(c, taken)) };
}

/** Duplicates a node right after itself. Returns the new scene and the copy's id. */
export function duplicateNode(scene: Scene, id: string): { scene: Scene; newId: string | null } {
  const parent = findParent(scene, id);
  const node = findNode(scene, id);
  if (!parent || !node) return { scene, newId: null };
  const copy = cloneWithNewIds(node, allIds(scene));
  const next = updateNode(scene, parent.id, (p) => {
    const kids = [...(p.children ?? [])];
    kids.splice(kids.findIndex((c) => c.id === id) + 1, 0, copy);
    return { ...p, children: kids };
  });
  return { scene: next, newId: copy.id };
}

export function moveNode(scene: Scene, id: string, dir: -1 | 1): Scene {
  const parent = findParent(scene, id);
  if (!parent?.children) return scene;
  const i = parent.children.findIndex((c) => c.id === id);
  const j = i + dir;
  if (j < 0 || j >= parent.children.length) return scene;
  return updateNode(scene, parent.id, (p) => {
    const kids = [...p.children!];
    [kids[i], kids[j]] = [kids[j], kids[i]];
    return { ...p, children: kids };
  });
}

export function nodeLabel(n: SceneNode): string {
  if (n.name) return n.name;
  const t = n.text?.trim();
  return t ? `${n.tag} · ${t.slice(0, 24)}${t.length > 24 ? "…" : ""}` : n.tag;
}
