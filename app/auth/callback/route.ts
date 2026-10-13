// GET /auth/callback: where the magic link lands. Turns the one-time code into a session cookie, then redirects
// to a same-origin path. `next` is untrusted input and goes through safeNextPath (no open redirects).
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/guard";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!isSupabaseConfigured()) return to("/signin");

  const code = url.searchParams.get("code");
  // Only present if the Supabase email template is changed to link here with a token hash (see README).
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  try {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : tokenHash && type && OTP_TYPES.includes(type)
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        : { error: new Error("missing code") };
    if (!error) return to(safeNextPath(url.searchParams.get("next")));
  } catch {
    // Fall through to the error page.
  }
  // Expired, already used, or opened in a different browser from the one that asked for it.
  return to("/signin?error=link");
}
