// Browser Supabase client (anon key + the session cookie). Use only from client components.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export { isSupabaseConfigured };

/** null when accounts are not configured. createBrowserClient returns one shared instance in the browser. */
export function createClient(): SupabaseClient | null {
  return isSupabaseConfigured() ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
}
