"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Browser Supabase client, or null when the env vars aren't set (local-only mode).
 * It shares content-intake's Supabase project, so people sign in with the same account.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** The section generator's own tables live in this schema. */
export const sg = () => supabase!.schema("section_gen");

/** Authorization header for our API routes, so the server can check the caller is signed in. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
