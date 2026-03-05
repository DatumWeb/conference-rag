import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Manual authentication for Edge Functions.
 *
 * Supabase Auth can issue ES256 JWTs, but the Edge Function gateway may only
 * verify HS256. So we deploy with --no-verify-jwt and verify here using
 * supabase.auth.getUser(), which correctly handles the token via Auth service.
 *
 * Returns the user object if valid, or a 401 Response if not.
 */
export async function requireAuth(req: Request): Promise<
  { user: { id: string; email?: string } } | { error: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      error: new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  return { user };
}
