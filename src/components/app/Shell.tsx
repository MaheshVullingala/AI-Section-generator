"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./AuthGate";

export function Shell({ children, crumbs, actions, wide }: { children: ReactNode; crumbs?: { label: string; href?: string }[]; actions?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${wide ? "" : "max-w-7xl"}`}>
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-xs font-bold text-white">SG</span>
            Section Generator
          </Link>
          {crumbs?.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-3 text-sm text-slate-500">
              <span aria-hidden>/</span>
              {c.href ? (
                <Link href={c.href} className="truncate hover:text-slate-900">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-slate-900">{c.label}</span>
              )}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 ${wide ? "" : "max-w-7xl px-4 py-8"}`}>{children}</main>
    </div>
  );
}

export function Swatches({ colors, max = 6 }: { colors: Record<string, string>; max?: number }) {
  return (
    <div className="flex -space-x-1">
      {Object.values(colors)
        .slice(0, max)
        .map((c, i) => (
          <span key={i} className="h-5 w-5 rounded-full border-2 border-white" style={{ background: c }} />
        ))}
    </div>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString();
}
