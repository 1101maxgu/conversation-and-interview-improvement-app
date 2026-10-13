// Public Supabase settings, safe for the browser bundle by design. There is no service-role key anywhere in this app:
// every database call runs as the signed-in user, so row-level security is the real boundary.
// The names must be written out in full: Next.js inlines NEXT_PUBLIC_* by literal match.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** False = accounts are switched off and the app behaves exactly as it does for guests. */
export function isSupabaseConfigured(): boolean {
  return /^https?:\/\/\S+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 0;
}
