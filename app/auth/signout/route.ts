// POST /auth/signout: POST only (a link or an image tag on another site cannot sign anyone out), then back home.
import { NextResponse } from "next/server";
import { jsonError, sameOrigin } from "@/lib/guard";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return jsonError(403, "Cross-site requests are not allowed.");
  if (isSupabaseConfigured()) {
    try {
      // "local" ends this browser's session and clears its cookies without signing the user out elsewhere.
      await (await createClient()).auth.signOut({ scope: "local" });
    } catch {
      // Supabase unreachable: the redirect below still happens; the cookie expires on its own.
    }
  }
  // 303 so the browser follows with a GET.
  return NextResponse.redirect(new URL("/", req.url), 303);
}
