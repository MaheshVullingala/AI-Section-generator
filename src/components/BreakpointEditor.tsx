"use client";
import type { Breakpoint } from "@/lib/types";
import { Button, Input } from "./ui";

export function BreakpointEditor({ value, onChange }: { value: Breakpoint[]; onChange: (b: Breakpoint[]) => void }) {
  const update = (i: number, patch: Partial<Breakpoint>) => onChange(value.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-2">
      {value.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input aria-label="Breakpoint name" value={b.name} onChange={(e) => update(i, { name: e.target.value })} className="max-w-40" />
          <Input
            aria-label="Width in pixels"
            type="number"
            min={240}
            max={3840}
            value={b.width}
            onChange={(e) => update(i, { width: Number(e.target.value) })}
            className="max-w-28"
          />
          <span className="text-sm text-slate-500">px</span>
          <Button variant="danger" type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${b.name}`}>
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        type="button"
        onClick={() => onChange([...value, { name: `Breakpoint ${value.length + 1}`, width: 1280 }])}
      >
        Add breakpoint
      </Button>
    </div>
  );
}

export const sortBreakpoints = (b: Breakpoint[]) => [...b].filter((x) => x.width > 0).sort((a, c) => a.width - c.width);
