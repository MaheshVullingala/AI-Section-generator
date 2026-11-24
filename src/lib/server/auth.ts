import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** A signed-in member, with a Supabase client that acts as them. null in local-only mode. */
export type Member = { db: SupabaseClient; email: string } | null;

/**
 * When Supabase is configured, API routes only serve signed-in members (people whose
 * email matches section_gen.allowed_emails). Returns an error Response, or the member.
 */
export async function authorize(request: Request): Promise<{ denied: Response } | { member: Member }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The anon key works too (older Supabase projects and content-intake use that name).
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Local-only mode is for development. A production server without sign-in would
    // let anyone with the URL spend Claude credits, so refuse unless explicitly allowed.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_NO_AUTH !== "true") {
      return {
        denied: Response.json(
          { error: "Sign-in isn't configured on this server. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy." },
          { status: 503 },
        ),
      };
    }
    return { member: null };
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: Response.json({ error: "Please sign in." }, { status: 401 }) };
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user, error } = await client.auth.getUser(token);
  if (error || !user.user) return { denied: Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) };
  const { data: member } = await client.schema("section_gen").rpc("is_member");
  if (member !== true) return { denied: Response.json({ error: "Your account doesn't have access to Forma." }, { status: 403 }) };
  return { member: { db: client, email: user.user.email ?? "" } };
}

/** Like authorize(), for routes that only need the yes/no. Returns an error Response, or null if allowed. */
export async function requireMember(request: Request): Promise<Response | null> {
  const result = await authorize(request);
  return "denied" in result ? result.denied : null;
}
