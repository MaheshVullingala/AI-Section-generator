import type { CallUsage } from "../claude";
import type { Allowance } from "../types";
import type { Member } from "./auth";

/**
 * The caller's allowance for this month, or null when there's nothing to enforce
 * (local-only mode, or the usage tables aren't set up yet, which is logged).
 */
export async function getAllowance(member: Member): Promise<Allowance | null> {
  if (!member) return null;
  const { data, error } = await member.db.schema("section_gen").rpc("my_allowance");
  if (error) {
    console.error(`[usage] couldn't read the allowance for ${member.email}: ${error.message}`);
    return null;
  }
  return data as Allowance;
}

/** True when the person has used their whole allowance (a null limit means no limit). */
export function isOverAllowance(a: Allowance | null): boolean {
  return !!a && a.limit_usd != null && a.spent_usd >= a.limit_usd;
}

/**
 * Checks the allowance before a Claude call. Returns a 402 Response when it's used up;
 * the browser then offers to ask an admin for more.
 */
export async function checkAllowance(member: Member): Promise<{ denied: Response } | { allowance: Allowance | null }> {
  const allowance = await getAllowance(member);
  if (isOverAllowance(allowance)) {
    const pending = (allowance?.pending_usd ?? 0) > 0;
    return {
      denied: Response.json(
        {
          error: pending
            ? "You've used this month's Claude allowance. Your request for more is waiting for an admin."
            : "You've used this month's Claude allowance. Ask an admin for more to keep going.",
          code: "allowance_exceeded",
          allowance,
        },
        { status: 402 },
      ),
    };
  }
  return { allowance };
}

/**
 * Collects the usage of every Claude call in a request and saves each one to
 * section_gen.usage_events. Call flush() before responding: hosts can stop a function
 * as soon as the response is sent.
 */
export function usageRecorder(member: Member, ctx: { projectId?: string; sectionId?: string; premium?: boolean; label?: string }) {
  const pending: Promise<void>[] = [];
  let total = 0;
  const onUsage = (u: CallUsage, label?: string) => {
    total += u.cost ?? 0;
    if (!member) return;
    if (u.cost == null) console.warn(`[usage] no price for ${u.model}; recorded at $0`);
    pending.push(
      (async () => {
        const { error } = await member.db.schema("section_gen").rpc("record_usage", {
          p_label: label ?? ctx.label ?? "claude",
          p_model: u.model,
          p_project_id: ctx.projectId ?? null,
          p_section_id: ctx.sectionId ?? null,
          p_premium: !!ctx.premium,
          p_input: u.input,
          p_output: u.output,
          p_cache_read: u.cacheRead,
          p_cache_write: u.cacheWrite,
          p_cost: u.cost ?? 0,
          p_savings: u.cacheSavings,
        });
        if (error) console.error(`[usage] couldn't record usage for ${member.email}: ${error.message}`);
      })(),
    );
  };
  return {
    onUsage,
    /** Saves the collected usage and returns the updated allowance (null when not tracked). */
    async flush(): Promise<Allowance | null> {
      await Promise.allSettled(pending);
      return getAllowance(member);
    },
    get totalUsd() {
      return total;
    },
  };
}
