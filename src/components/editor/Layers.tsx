"use client";
import { useState } from "react";
import { nodeLabel, pathTo } from "@/lib/scene/ops";
import type { Scene, SceneNode } from "@/lib/scene/types";
import { cx } from "../ui";

function Row({
  node,
  depth,
  selectedId,
  openIds,
  toggle,
  onSelect,
  onMove,
}: {
  node: SceneNode;
  depth: number;
  selectedId: string | null;
  openIds: Set<string>;
  toggle: (id: string) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const hasKids = !!node.children?.length;
  const open = openIds.has(node.id);
  const selected = node.id === selectedId;
  return (
    <li>
      <div
        className={cx(
          "group flex items-center gap-1 rounded py-0.5 pr-1 text-xs",
          selected ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100",
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={() => toggle(node.id)}
          className={cx("w-4 shrink-0 text-center", !hasKids && "invisible")}
        >
          {open ? "▾" : "▸"}
        </button>
        <button type="button" onClick={() => onSelect(node.id)} className="min-w-0 flex-1 truncate text-left" title={`#${node.id}`}>
          {nodeLabel(node)}
        </button>
        {node.behavior && (
          <span className={cx("rounded px-1 text-[10px]", selected ? "bg-white/20" : "bg-violet-100 text-violet-700")}>{node.behavior.type}</span>
        )}
        {node.part && <span className={cx("rounded px-1 text-[10px]", selected ? "bg-white/20" : "bg-slate-200 text-slate-600")}>{node.part}</span>}
        {selected && depth > 0 && (
          <span className="flex shrink-0">
            <button type="button" aria-label="Move up" onClick={() => onMove(node.id, -1)} className="px-0.5 hover:opacity-70">
              ↑
            </button>
            <button type="button" aria-label="Move down" onClick={() => onMove(node.id, 1)} className="px-0.5 hover:opacity-70">
              ↓
            </button>
          </span>
        )}
      </div>
      {hasKids && open && (
        <ul>
          {node.children!.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} selectedId={selectedId} openIds={openIds} toggle={toggle} onSelect={onSelect} onMove={onMove} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Layers({
  scene,
  selectedId,
  onSelect,
  onMove,
}: {
  scene: Scene;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const [manual, setManual] = useState<Set<string>>(() => new Set([scene.root.id]));
  // Always expand the path to the current selection so it is visible.
  const openIds = new Set([...manual, ...(selectedId ? pathTo(scene, selectedId).slice(0, -1) : [])]);
  const toggle = (id: string) =>
    setManual((prev) => {
      const next = new Set(prev);
      if (openIds.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <ul className="max-h-[50vh] overflow-auto">
      <Row node={scene.root} depth={0} selectedId={selectedId} openIds={openIds} toggle={toggle} onSelect={onSelect} onMove={onMove} />
    </ul>
  );
}
