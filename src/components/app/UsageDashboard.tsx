"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { allowanceLevel, fetchAllowance, publishAllowance, usd, usedFraction, type AllowanceLevel } from "@/lib/allowance";
import { sg, supabase } from "@/lib/supabase";
import type { Allowance } from "@/lib/types";
import { Button, Card, Input, Select, cx } from "../ui";
import { Shell } from "./Shell";
import { RequestMore } from "./Usage";

interface UsageEvent {
  email: string;
  project_id: string | null;
  section_id: string | null;
  label: string;
  model: string;
  premium: boolean;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  cache_savings_usd: number;
  created_at: string;
}
interface Person {
  email: string;
  role: string;
  limit_usd: number | null;
  spent_usd: number;
  calls: number;
  premium_usd: number;
}
interface RoleAllowance {
  role: string;
  monthly_usd: number | null;
  description: string;
}
interface UserRole {
  email: string;
  role: string;
  monthly_usd: number | null;
}
interface Request {
  id: number;
  email: string;
  amount_usd: number;
  note: string;
  status: string;
  approved_usd: number | null;
  created_at: string;
}
interface Settings {
  team_monthly_usd: number;
  warn_at: number[];
}

const BAR: Record<AllowanceLevel, string> = { none: "bg-indigo-600", ok: "bg-indigo-600", warn: "bg-amber-700", high: "bg-red-600", over: "bg-red-600" };
const num = (n: unknown) => Number(n ?? 0);
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n));
const money = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);
/** "design:clean" -> "design", "refine:focused" -> "refine". Labels with "(turn 2)" are the same job. */
const job = (label: string) => label.split(/[:\s]/)[0] || label;
const JOB_NAMES: Record<string, string> = { brief: "Brief chat", design: "Designs", refine: "Refinements" };

function Meter({ fraction, level, className }: { fraction: number | null; level: AllowanceLevel; className?: string }) {
  if (fraction == null) return <span className={cx("sg-label", className)}>No limit</span>;
  return (
    <span className={cx("block h-1.5 overflow-hidden rounded-full bg-slate-200", className)} aria-hidden>
      <span className={cx("block h-full", BAR[level])} style={{ width: `${Math.min(100, Math.round(fraction * 100))}%` }} />
    </span>
  );
}

function levelOf(spent: number, limit: number | null, warn: number[]): AllowanceLevel {
  if (limit == null) return "none";
  const f = limit > 0 ? spent / limit : 1;
  const [w1 = 0.7, w2 = 0.9] = warn;
  return f >= 1 ? "over" : f >= w2 ? "high" : f >= w1 ? "warn" : "ok";
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="space-y-1">
      <p className="sg-label">{label}</p>
      <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {head.map((h, i) => (
              <th key={i} className={cx("sg-label py-2 pr-4 font-normal", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-200/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cx("py-2 pr-4 align-middle tabular-nums", j > 0 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-slate-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Your own allowance, and for admins the team's spending, people, requests and settings. */
export function UsageDashboard() {
  const [me, setMe] = useState<Allowance | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);
  const [mine, setMine] = useState<UsageEvent[]>([]);

  const load = useCallback(async () => {
    const a = await fetchAllowance();
    setMe(a);
    publishAllowance(a);
    if (!supabase || !a) return;
    const { data: isAdmin } = await sg().rpc("is_admin");
    setAdmin(isAdmin === true);
    const { data: own } = await sg()
      .from("usage_events")
      .select("label, model, cost_usd, created_at, premium")
      .eq("email", (await supabase.auth.getUser()).data.user?.email?.toLowerCase() ?? "")
      .gte("created_at", a.month)
      .order("created_at", { ascending: false })
      .limit(20);
    setMine((own ?? []) as UsageEvent[]);
  }, []);
  useEffect(() => {
    // Loads from Supabase; the state updates happen after the request returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (me === undefined) return <Shell crumbs={[{ label: "Usage" }]}>Loading…</Shell>;
  if (!me)
    return (
      <Shell crumbs={[{ label: "Usage" }]}>
        <Card>
          <p className="text-sm text-slate-600">Usage tracking isn&apos;t set up here. It needs shared storage (Supabase) and the usage tables from supabase/usage_allowances.sql.</p>
        </Card>
      </Shell>
    );

  const f = usedFraction(me);
  const level = allowanceLevel(me);
  return (
    <Shell crumbs={[{ label: "Usage" }]}>
      <div className="space-y-10">
        <Section title="Your Claude usage this month">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="font-display text-3xl font-semibold tabular-nums text-slate-900">
                {usd(me.spent_usd)}
                {me.limit_usd != null && <span className="text-lg text-slate-500"> of {usd(me.limit_usd)}</span>}
              </p>
              <p className="sg-label">
                Role: {me.role}
                {me.extra_usd > 0 && ` · includes ${usd(me.extra_usd)} approved extra`}
              </p>
            </div>
            <Meter fraction={f} level={level} className="w-full max-w-md" />
            {level === "over" ? (
              <RequestMore allowance={me} />
            ) : (
              me.pending_usd > 0 && <p className="text-xs text-amber-700">Your request for {usd(me.pending_usd)} more is waiting for an admin.</p>
            )}
            <p className="text-xs text-slate-500">
              Costs are estimates from the token counts Claude returns, at Anthropic&apos;s standard prices. Ticking Premium (Opus) costs about twice as much as a normal request.
            </p>
          </Card>
          {!!mine.length && (
            <Table
              head={["Recent requests", "Model", "Cost"]}
              rows={mine.map((e) => [
                <span key="l">
                  {JOB_NAMES[job(e.label)] ?? e.label} <span className="text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
                </span>,
                e.model + (e.premium ? " (premium)" : ""),
                money(num(e.cost_usd)),
              ])}
              empty=""
            />
          )}
        </Section>
        {admin && <AdminDashboard month={me.month} onChange={load} />}
      </div>
    </Shell>
  );
}

function AdminDashboard({ month, onChange }: { month: string; onChange: () => void }) {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [roles, setRoles] = useState<RoleAllowance[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [ev, ppl, rl, ur, rq, st, pj] = await Promise.all([
      sg().from("usage_events").select("*").gte("created_at", month).order("created_at", { ascending: false }).limit(10000),
      sg().rpc("usage_by_person", { p_month: month }),
      sg().from("role_allowances").select("*").order("role"),
      sg().from("user_roles").select("email, role, monthly_usd"),
      sg().from("allowance_requests").select("*").order("created_at", { ascending: false }).limit(50),
      sg().from("budget_settings").select("team_monthly_usd, warn_at").single(),
      sg().from("projects").select("id, name"),
    ]);
    const err = [ev, ppl, rl, ur, rq, st].find((r) => r.error)?.error;
    if (err) setError(err.message);
    setEvents((ev.data ?? []) as UsageEvent[]);
    setPeople(((ppl.data ?? []) as Person[]).map((p) => ({ ...p, spent_usd: num(p.spent_usd), limit_usd: p.limit_usd == null ? null : num(p.limit_usd) })));
    setRoles((rl.data ?? []) as RoleAllowance[]);
    setUserRoles((ur.data ?? []) as UserRole[]);
    setRequests((rq.data ?? []) as Request[]);
    setSettings(st.data ? { team_monthly_usd: num(st.data.team_monthly_usd), warn_at: (st.data.warn_at as number[]).map(Number) } : null);
    setProjects(Object.fromEntries(((pj.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])));
  }, [month]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError("");
    const { error } = await fn();
    if (error) setError(error.message);
    await load();
    onChange();
  };

  const warn = settings?.warn_at ?? [0.7, 0.9];
  const totals = useMemo(() => {
    const t = { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, savings: 0, premium: 0 };
    for (const e of events) {
      t.cost += num(e.cost_usd);
      t.input += e.input_tokens;
      t.output += e.output_tokens;
      t.cacheRead += e.cache_read_tokens;
      t.cacheWrite += e.cache_write_tokens;
      t.savings += num(e.cache_savings_usd);
      if (e.premium) t.premium += num(e.cost_usd);
    }
    return t;
  }, [events]);

  const groupBy = (key: (e: UsageEvent) => string) => {
    const m = new Map<string, { calls: number; cost: number; input: number; output: number; cacheRead: number; sections: Set<string> }>();
    for (const e of events) {
      const k = key(e);
      const g = m.get(k) ?? { calls: 0, cost: 0, input: 0, output: 0, cacheRead: 0, sections: new Set<string>() };
      g.calls++;
      g.cost += num(e.cost_usd);
      g.input += e.input_tokens;
      g.output += e.output_tokens;
      g.cacheRead += e.cache_read_tokens;
      if (e.section_id) g.sections.add(e.section_id);
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  };
  const byProject = groupBy((e) => e.project_id ?? "(none)");
  const byModel = groupBy((e) => e.model);
  const byJob = groupBy((e) => job(e.label));

  // Alerts: people near their limit, and sections regenerated many times this month.
  const designsBySection = groupBy((e) => (job(e.label) === "design" && e.section_id ? e.section_id : "")).filter(([k, g]) => k && g.calls >= 9);
  const nearLimit = people.filter((p) => ["high", "over"].includes(levelOf(p.spent_usd, p.limit_usd, warn)));
  const teamLevel = settings ? levelOf(totals.cost, settings.team_monthly_usd, warn) : "none";
  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-8">
        <h1 className="font-display text-xl font-semibold text-slate-900">Team usage · {new Date(month + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h1>
        <span className="sg-label text-amber-700">Admin</span>
      </div>
      {error && (
        <p role="alert" className="rounded-sm border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Spent this month"
          value={money(totals.cost)}
          sub={
            settings && (
              <span className="space-y-1.5">
                <span className="block">of the {usd(settings.team_monthly_usd)} team budget</span>
                <Meter fraction={settings.team_monthly_usd > 0 ? totals.cost / settings.team_monthly_usd : 1} level={teamLevel} />
              </span>
            )
          }
        />
        <Stat label="Tokens" value={tokens(totals.input + totals.output + totals.cacheRead + totals.cacheWrite)} sub={`${tokens(totals.input)} in · ${tokens(totals.output)} out · ${tokens(totals.cacheRead)} cached`} />
        <Stat label="Saved by caching" value={money(totals.savings)} sub={`${tokens(totals.cacheRead)} tokens read from the cache`} />
        <Stat label="Premium (Opus)" value={money(totals.premium)} sub={totals.cost ? `${Math.round((totals.premium / totals.cost) * 100)}% of spend` : "No spend yet"} />
      </div>

      {(teamLevel === "warn" || teamLevel === "high" || teamLevel === "over" || nearLimit.length > 0 || designsBySection.length > 0) && (
        <Section title="Alerts">
          <ul className="space-y-2 text-sm">
            {teamLevel !== "ok" && teamLevel !== "none" && settings && (
              <li className={cx("rounded-sm border-l-2 px-3 py-2", teamLevel === "warn" ? "border-amber-700 bg-amber-50 text-amber-900" : "border-red-600 bg-red-50 text-red-800")}>
                The team has used {Math.round((totals.cost / settings.team_monthly_usd) * 100)}% of the {usd(settings.team_monthly_usd)} monthly budget.
              </li>
            )}
            {nearLimit.map((p) => (
              <li key={p.email} className="rounded-sm border-l-2 border-red-600 bg-red-50 px-3 py-2 text-red-800">
                {p.email} has used {money(p.spent_usd)} of {usd(p.limit_usd)}.
              </li>
            ))}
            {designsBySection.map(([id, g]) => (
              <li key={id} className="rounded-sm border-l-2 border-amber-700 bg-amber-50 px-3 py-2 text-amber-900">
                A section was regenerated {Math.round(g.calls / 3)} times this month ({g.calls} designs, {money(g.cost)}).{" "}
                <a className="underline" href={`/s/${id}`}>
                  Open it
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Requests for more" aside={<span className="sg-label">{pending.length} waiting</span>}>
        <Table
          head={["Person", "Asked for", "Note", ""]}
          rows={requests.slice(0, 15).map((r) => [
            <span key="e">
              {r.email} <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span>
            </span>,
            usd(num(r.amount_usd)),
            <span key="n" className="text-slate-600">
              {r.note || "–"}
            </span>,
            r.status === "pending" ? (
              <Decide key="d" request={r} onDecide={(approve, amount) => run(() => sg().rpc("decide_request", { p_id: r.id, p_approve: approve, p_amount: amount }))} />
            ) : (
              <span key="s" className={cx("sg-label", r.status === "approved" ? "text-emerald-700" : "text-slate-500")}>
                {r.status === "approved" ? `Approved ${usd(num(r.approved_usd))}` : "Declined"}
              </span>
            ),
          ])}
          empty="No requests yet."
        />
      </Section>

      <Section title="People">
        <Table
          head={["Person", "Role", "Allowance", "Spent", "Used", "Requests"]}
          rows={people.map((p) => {
            const ur = userRoles.find((u) => u.email === p.email);
            const lvl = levelOf(p.spent_usd, p.limit_usd, warn);
            return [
              p.email,
              <Select
                key="r"
                value={p.role}
                aria-label={`Role for ${p.email}`}
                className="w-32 py-1 text-xs"
                onChange={(e) => run(() => sg().from("user_roles").upsert({ email: p.email, role: e.target.value, monthly_usd: ur?.monthly_usd ?? null }))}
              >
                {roles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.role}
                  </option>
                ))}
              </Select>,
              <NumberCell
                key="a"
                value={ur?.monthly_usd ?? null}
                placeholder="role default"
                label={`Personal allowance for ${p.email}`}
                onSave={(v) => run(() => sg().from("user_roles").upsert({ email: p.email, role: p.role, monthly_usd: v }))}
              />,
              <span key="s">
                {money(p.spent_usd)} {p.limit_usd != null && <span className="text-xs text-slate-500">of {usd(p.limit_usd)}</span>}
              </span>,
              <Meter key="m" fraction={p.limit_usd == null ? null : p.limit_usd > 0 ? p.spent_usd / p.limit_usd : 1} level={lvl} className="ml-auto w-24" />,
              String(p.calls),
            ];
          })}
          empty="Nobody has used Claude this month."
        />
        <AddPerson roles={roles} onAdd={(email, role) => run(() => sg().from("user_roles").upsert({ email, role }))} />
        <p className="text-xs text-slate-500">People not listed here are Creators. Access to Forma itself is still set by the access list (allowed emails).</p>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="By job">
          <Table
            head={["Job", "Calls", "Avg per call", "Total"]}
            rows={byJob.map(([k, g]) => [JOB_NAMES[k] ?? k, String(g.calls), money(g.cost / g.calls), money(g.cost)])}
            empty="No usage yet."
          />
          <p className="text-xs text-slate-500">A set of 3 designs is 3 design calls.</p>
        </Section>
        <Section title="By model">
          <Table
            head={["Model", "Calls", "Input", "Output", "Cached", "Total"]}
            rows={byModel.map(([k, g]) => [k, String(g.calls), tokens(g.input), tokens(g.output), tokens(g.cacheRead), money(g.cost)])}
            empty="No usage yet."
          />
        </Section>
      </div>

      <Section title="By project">
        <Table
          head={["Project", "Sections", "Calls", "Total"]}
          rows={byProject.map(([k, g]) => [projects[k] ?? (k === "(none)" ? "Editor refinements" : k), String(g.sections.size), String(g.calls), money(g.cost)])}
          empty="No usage yet."
        />
      </Section>

      <Section title="Allowances and budget">
        <Card className="space-y-4">
          <Table
            head={["Role", "Monthly allowance"]}
            rows={roles.map((r) => [
              <span key="r">
                {r.role} <span className="text-xs text-slate-500">{r.description}</span>
              </span>,
              <NumberCell
                key="v"
                value={r.monthly_usd == null ? null : num(r.monthly_usd)}
                placeholder="no limit"
                label={`Monthly allowance for ${r.role}`}
                onSave={(v) => run(() => sg().from("role_allowances").update({ monthly_usd: v }).eq("role", r.role))}
              />,
            ])}
            empty=""
          />
          {settings && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                Team budget per month
                <NumberCell value={settings.team_monthly_usd} label="Team budget per month" onSave={(v) => run(() => sg().from("budget_settings").update({ team_monthly_usd: v ?? 0, updated_at: new Date().toISOString() }).eq("id", true))} />
              </label>
              <span className="text-slate-500">Warnings at {warn.map((w) => `${Math.round(w * 100)}%`).join(" and ")} of each allowance and the team budget. Requests pause at 100%.</span>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}

/** A dollar amount saved on blur or Enter. Empty means null (role default, or no limit). */
function NumberCell({ value, placeholder, label, onSave }: { value: number | null; placeholder?: string; label: string; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(num(value)));
  const save = () => {
    const v = text.trim() === "" ? null : Number(text);
    if (v != null && !(v >= 0)) return setText(value == null ? "" : String(value));
    if (v !== (value == null ? null : num(value))) onSave(v);
  };
  return (
    <span className="inline-flex items-center gap-1">
      $
      <Input
        type="number"
        min="0"
        step="1"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        className="w-28 py-1 text-right text-xs"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </span>
  );
}

function Decide({ request, onDecide }: { request: Request; onDecide: (approve: boolean, amount: number | null) => void }) {
  const [amount, setAmount] = useState(String(num(request.amount_usd)));
  return (
    <span className="inline-flex items-center gap-1.5">
      $
      <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount to approve" className="w-20 py-1 text-right text-xs" />
      <Button className="px-2 py-1 text-xs" onClick={() => onDecide(true, Number(amount) || 0)}>
        Approve
      </Button>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onDecide(false, null)}>
        Decline
      </Button>
    </span>
  );
}

function AddPerson({ roles, onAdd }: { roles: RoleAllowance[]; onAdd: (email: string, role: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("creator");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = email.trim().toLowerCase();
        if (!v.includes("@")) return;
        onAdd(v, role);
        setEmail("");
      }}
    >
      <span className="w-64 max-w-full">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@cadence.com" aria-label="Email" className="py-1 text-xs" />
      </span>
      <span className="w-32">
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="py-1 text-xs">
          {roles.map((r) => (
            <option key={r.role} value={r.role}>
              {r.role}
            </option>
          ))}
        </Select>
      </span>
      <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">
        Set role
      </Button>
    </form>
  );
}
