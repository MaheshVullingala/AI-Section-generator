"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { allowanceLevel, requestMore, usd, usedFraction, useAllowance, type AllowanceLevel } from "@/lib/allowance";
import type { Allowance } from "@/lib/types";
import { Button, cx } from "../ui";

const BAR: Record<AllowanceLevel, string> = { none: "bg-indigo-600", ok: "bg-indigo-600", warn: "bg-amber-700", high: "bg-red-600", over: "bg-red-600" };
const TEXT: Record<AllowanceLevel, string> = { none: "text-slate-500", ok: "text-slate-500", warn: "text-amber-700", high: "text-red-700", over: "text-red-700" };

/** This month's spend against the allowance, for the header. Links to the usage page. */
export function UsageMeter() {
  const [a] = useAllowance();
  if (!a) return null;
  const level = allowanceLevel(a);
  const f = usedFraction(a);
  return (
    <Link
      href="/usage"
      title={a.limit_usd == null ? `${usd(a.spent_usd)} of Claude usage this month` : `${usd(a.spent_usd)} of your ${usd(a.limit_usd)} Claude allowance this month`}
      className={cx("flex items-center gap-2 rounded px-2 py-1 font-mono text-[11px] uppercase tracking-wider hover:bg-slate-100", TEXT[level])}
    >
      <span>
        {usd(a.spent_usd)}
        {a.limit_usd != null && <span className="text-slate-400"> / {usd(a.limit_usd)}</span>}
      </span>
      {f != null && (
        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-200 sm:block" aria-hidden>
          <span className={cx("block h-full", BAR[level])} style={{ width: `${Math.min(100, Math.round(f * 100))}%` }} />
        </span>
      )}
    </Link>
  );
}

/** The 70% and 90% warnings, and the request form at 100%. Shown above the chat box. */
export function AllowanceNotice({ allowance }: { allowance: Allowance | null }) {
  const level = allowanceLevel(allowance);
  if (!allowance || level === "none" || level === "ok") return null;
  const pct = Math.round((usedFraction(allowance) ?? 0) * 100);
  if (level === "over") return <RequestMore allowance={allowance} />;
  return (
    <p className={cx("rounded-sm border-l-2 px-3 py-2 text-xs", level === "high" ? "border-red-600 bg-red-50 text-red-800" : "border-amber-700 bg-amber-50 text-amber-900")}>
      You&apos;ve used {pct}% of this month&apos;s Claude allowance ({usd(allowance.spent_usd)} of {usd(allowance.limit_usd)}).
      {level === "high" && " New requests pause at 100% until an admin approves more."}
    </p>
  );
}

/** At 100%: ask an admin for more, or show that a request is waiting. */
export function RequestMore({ allowance }: { allowance: Allowance }) {
  const [, refresh] = useAllowance();
  const suggested = Math.max(5, Math.round((allowance.base_usd ?? 10) / 2));
  const [amount, setAmount] = useState(String(suggested));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  if (allowance.pending_usd > 0 || sent)
    return (
      <p className="rounded-sm border-l-2 border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        You&apos;ve used this month&apos;s Claude allowance. Your request for {usd(sent ? Number(amount) : allowance.pending_usd)} more is waiting for an admin.
      </p>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return setError("Enter an amount in dollars.");
    setBusy(true);
    setError("");
    try {
      await requestMore(n, note.trim());
      setSent(true);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-sm border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs text-red-800">
      <p>
        You&apos;ve used this month&apos;s Claude allowance ({usd(allowance.spent_usd)} of {usd(allowance.limit_usd)}). Ask an admin for more to keep going.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          $
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Extra amount in dollars"
            className="w-16 rounded border border-red-600 bg-white px-2 py-1 text-slate-900"
          />
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What it's for (optional)"
          aria-label="What it's for"
          className="min-w-0 flex-1 rounded border border-red-600 bg-white px-2 py-1 text-slate-900"
        />
        <Button type="submit" disabled={busy} className="px-2.5 py-1 text-xs">
          {busy ? "Sending…" : "Request more"}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
