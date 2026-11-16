import { createClient } from "@supabase/supabase-js";

/**
 * When Supabase is configured, API routes only serve signed-in members (people whose
 * email matches section_gen.allowed_emails). Returns an error Response, or null if allowed.
 */
export async function requireMember(request: Request): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Local-only mode is for development. A production server without sign-in would
    // let anyone with the URL spend Claude credits, so refuse unless explicitly allowed.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_NO_AUTH !== "true") {
      return Response.json(
        { error: "Sign-in isn't configured on this server. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy." },
        { status: 503 },
      );
    }
    return null;
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Please sign in." }, { status: 401 });
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user, error } = await client.auth.getUser(token);
  if (error || !user.user) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const { data: member } = await client.schema("section_gen").rpc("is_member");
  if (member !== true) return Response.json({ error: "Your account doesn't have access to the section generator." }, { status: 403 });
  return null;
}
