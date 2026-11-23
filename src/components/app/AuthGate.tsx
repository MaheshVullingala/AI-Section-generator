"use client";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { sg, supabase } from "@/lib/supabase";
import { Logo } from "../ui";
import { Traces } from "./Shell";

type Access = "loading" | "signed-out" | "no-access" | "ok";
const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext);

/**
 * Sign-in gate. Uses the same Supabase accounts as content-intake (email + password,
 * or an emailed sign-in link when password login is turned off there). It never creates
 * accounts: new people are added in content-intake. With no Supabase env, the app runs open.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access>(supabase ? "loading" : "ok");

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const evaluate = async (s: Session | null) => {
      if (cancelled) return;
      setSession(s);
      if (!s) return setAccess("signed-out");
      const { data } = await sg().rpc("is_member");
      if (!cancelled) setAccess(data === true ? "ok" : "no-access");
    };
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => evaluate(s), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (access === "loading") return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</div>;
  if (access === "signed-out") return <SignIn />;
  if (access === "no-access")
    return (
      <Centered title="No access yet">
        <p className="text-sm text-slate-600">
          You&apos;re signed in as <strong>{session?.user.email}</strong>, but this account isn&apos;t on Forma&apos;s access list. Ask Mahesh to add you.
        </p>
        <button className="mt-4 text-sm font-medium text-indigo-600 hover:underline" onClick={() => supabase!.auth.signOut()}>
          Sign in with another account
        </button>
      </Centered>
    );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function Centered({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center bg-slate-50 px-4">
      <Traces />
      <div className="sg-lock relative z-10 w-full max-w-sm rounded-md border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-2.5 font-display font-bold uppercase tracking-wider text-slate-900">
          <Logo />
          Forma
        </div>
        <p className="sg-label -mt-3 mb-5">Ideas into Experiences</p>
        <h1 className="mb-2 text-lg font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [mode, setMode] = useState<"password" | "link">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // Same switch content-intake uses to turn password login on or off.
    supabase!.rpc("get_password_login_enabled").then(({ data, error }) => {
      if (!error && data === false) {
        setPasswordEnabled(false);
        setMode("link");
      }
    });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const addr = email.trim().toLowerCase();
    const res =
      mode === "password"
        ? await supabase!.auth.signInWithPassword({ email: addr, password })
        : await supabase!.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) setError(res.error.message === "Invalid login credentials" ? "That email and password don't match." : res.error.message);
    else if (mode === "link") setSent(true);
  }

  if (sent)
    return (
      <Centered title="Check your email">
        <p className="text-sm text-slate-600">We sent a sign-in link to {email}. Open it on this device to continue.</p>
      </Centered>
    );

  return (
    <Centered title="Sign in">
      <p className="mb-4 text-sm text-slate-600">Use your content-intake account.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Work email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/20" />
        </label>
        {mode === "password" && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/20" />
          </label>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="sg-glow w-full rounded bg-indigo-600 px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider text-white hover:bg-indigo-500 disabled:opacity-60">
          {busy ? "Signing in…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </button>
      </form>
      {passwordEnabled && (
        <button type="button" className="mt-3 text-sm text-indigo-600 hover:underline" onClick={() => { setMode(mode === "password" ? "link" : "password"); setError(""); }}>
          {mode === "password" ? "Email me a sign-in link instead" : "Use my password"}
        </button>
      )}
    </Centered>
  );
}

/** Signed-in email and a sign-out button, for the header. */
export function AccountMenu() {
  const session = useSession();
  if (!supabase || !session) return null;
  return (
    <div className="flex items-center gap-2 border-l border-slate-200 pl-3 font-mono text-[11px] text-slate-500">
      <span className="hidden max-w-40 truncate sm:inline">{session.user.email}</span>
      <button className="rounded px-2 py-1 font-medium uppercase tracking-wider text-slate-700 hover:bg-slate-100 hover:text-indigo-600" onClick={() => supabase!.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
