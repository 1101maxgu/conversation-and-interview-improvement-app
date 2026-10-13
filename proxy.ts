// Next.js 16 proxy (the renamed middleware). Its only job is to refresh the Supabase session cookie on page
// navigations, as @supabase/ssr recommends. It never blocks or redirects: guests and unconfigured deployments pass
// straight through. API routes are excluded: route handlers can write refreshed cookies themselves (lib/supabase/server).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Guests carry no Supabase cookie ("sb-<project-ref>-auth-token"): nothing to refresh, no work, no network.
  if (!isSupabaseConfigured() || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet, headers) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
          // Cache-Control: no-store and friends, so a CDN never caches a response that sets a session cookie.
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    });
    // Loads the session and refreshes it when the access token is about to expire.
    await supabase.auth.getClaims();
  } catch {
    // Supabase unreachable (free projects pause when idle): carry on as a guest.
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static files.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff2?|onnx|wasm)$).*)",
  ],
};
