"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../ui";
import { AccountMenu } from "./AuthGate";

/** Circuit traces behind the app. Pulses of light travel along two of them. */
export function Traces() {
  const a = "M0 120 H22 L26 160 H52 L56 120 H100";
  const b = "M0 820 H30 L34 780 H70 L74 820 H100";
  return (
    <svg className="sg-traces" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden>
      <path d={a} />
      <path className="sg-pulse" d={a} />
      <path d={b} />
      <path className="sg-pulse sg-amp" d={b} />
      <path d="M64 0 V60 L68 120 V1000" />
      <path d="M8 1000 V900 L12 860 V820" />
    </svg>
  );
}

export function Shell({ children, crumbs, actions, wide }: { children: ReactNode; crumbs?: { label: string; href?: string }[]; actions?: ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Traces />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/85 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${wide ? "" : "max-w-7xl"}`}>
          <Link href="/" className="flex items-center gap-2.5 font-display text-[15px] font-bold uppercase tracking-wider text-slate-900 hover:text-indigo-600">
            <Logo />
            Section Gen
          </Link>
          {crumbs?.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-3 font-mono text-xs uppercase tracking-wider text-slate-500">
              <span aria-hidden>{"//"}</span>
              {c.href ? (
                <Link href={c.href} className="truncate hover:text-indigo-600">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-slate-800">{c.label}</span>
              )}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className={`relative z-10 mx-auto w-full flex-1 ${wide ? "" : "max-w-7xl px-4 py-8"}`}>{children}</main>
    </div>
  );
}

export function Swatches({ colors, max = 6 }: { colors: Record<string, string>; max?: number }) {
  return (
    <div className="flex gap-1">
      {Object.values(colors)
        .slice(0, max)
        .map((c, i) => (
          <span key={i} className="h-4 w-4 rounded-[3px] ring-1 ring-slate-300" style={{ background: c }} />
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
