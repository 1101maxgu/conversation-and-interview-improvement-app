// Server Supabase client for route handlers: anon key + the caller's session cookie, so every query runs as that user
// under row-level security. Never import this from a client component (it reads request cookies).
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

export type AuthUser = { id: string; email: string | null };

/** A new client per request (never share one across requests). Throws when Supabase is not configured. */
export async function createClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Cookies are read-only in this context (a Server Component render). proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The verified signed-in user, or null (not configured, signed out, expired, forged, or Supabase unreachable).
 * Uses getClaims(), which checks the access token's signature (locally against the project's published keys, or by
 * asking the Auth server when the project signs with a shared secret). The cookie payload is never trusted as-is.
 * Never throws: for guests this resolves to null without touching cookies or the network.
 */
export async function getUser(client?: SupabaseClient): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub || claims.role !== "authenticated") return null;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
  } catch {
    return null;
  }
}
