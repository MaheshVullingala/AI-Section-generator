"use client";
import { useEffect, useState } from "react";
import { sg, supabase } from "./supabase";
import type { Allowance } from "./types";

const EVENT = "forma:allowance";

/** Shares a fresh allowance (e.g. from an API reply) with every meter on the page. */
export function publishAllowance(a: Allowance | null | undefined) {
  if (a && typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Allowance>(EVENT, { detail: a }));
}

/** Reads the signed-in person's allowance. null in local-only mode or before the usage tables exist. */
export async function fetchAllowance(): Promise<Allowance | null> {
  if (!supabase) return null;
  const { data, error } = await sg().rpc("my_allowance");
  return error ? null : (data as Allowance);
}

/** The current allowance, kept up to date after every Claude request. */
export function useAllowance(): [Allowance | null, () => void] {
  const [a, setA] = useState<Allowance | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetchAllowance().then((x) => live && setA(x));
    const on = (e: Event) => setA((e as CustomEvent<Allowance>).detail);
    window.addEventListener(EVENT, on);
    return () => {
      live = false;
      window.removeEventListener(EVENT, on);
    };
  }, [tick]);
  return [a, () => setTick((t) => t + 1)];
}

export type AllowanceLevel = "none" | "ok" | "warn" | "high" | "over";

/** Fraction of the limit used, or null for no limit. */
export function usedFraction(a: Allowance | null): number | null {
  if (!a || a.limit_usd == null) return null;
  return a.limit_usd > 0 ? a.spent_usd / a.limit_usd : 1;
}

/** ok below the first warning, warn and high at the two warning levels (70% and 90% by default), over at 100%. */
export function allowanceLevel(a: Allowance | null): AllowanceLevel {
  const f = usedFraction(a);
  if (f == null) return "none";
  const [w1 = 0.7, w2 = 0.9] = a!.warn_at ?? [];
  return f >= 1 ? "over" : f >= w2 ? "high" : f >= w1 ? "warn" : "ok";
}

export const usd = (n: number | null | undefined) => (n == null ? "no limit" : `$${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`);

/** Asks an admin for more allowance this month. */
export async function requestMore(amount: number, note: string): Promise<void> {
  if (!supabase) return;
  const { error } = await sg().rpc("request_more", { p_amount: amount, p_note: note });
  if (error) throw new Error(/pending/.test(error.message) ? "You already have a request waiting for an admin." : error.message);
}
