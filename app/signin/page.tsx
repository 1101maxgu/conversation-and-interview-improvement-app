"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { accountsEnabled, useUser } from "@/components/ui/auth";
import { APP_NAME } from "@/components/ui/brand";
import { createClient } from "@/lib/supabase/client";

// Reading the query string needs a Suspense boundary so the rest of the page can be prerendered.
export default function SignInPage() {
  return (
    <main className="container stage">
      <title>{`Sign in | ${APP_NAME}`}</title>
      <Suspense fallback={null}>
        <SignIn />
      </Suspense>
    </main>
  );
}

function SignIn() {
  const user = useUser();
  const linkFailed = useSearchParams().get("error") === "link";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const { error: failure } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (!failure) return setState("sent");
      setError(
        failure.status === 429 || /rate limit|security purposes/i.test(failure.message)
          ? "Too many sign-in emails have been requested. Please wait a few minutes, then try again."
          : "We couldn't send the sign-in link. Check the email address and try again.",
      );
    } catch {
      setError("We couldn't reach the sign-in service. Check your connection and try again in a minute.");
    }
    setState("idle");
  }

  if (!accountsEnabled) {
    return (
      <>
        <h1>Sign in</h1>
        <p className="muted">Accounts aren&apos;t set up on this site. You can still practise as a guest.</p>
        <Link href="/" className="btn btn-primary">
          Pick a companion
        </Link>
      </>
    );
  }

  if (user) {
    return (
      <>
        <h1>You&apos;re signed in</h1>
        <p className="muted">{user.email ? `Signed in as ${user.email}.` : "Your sessions are saved to your history."}</p>
        <div className="actions">
          <Link href="/history" className="btn btn-primary">
            Your history
          </Link>
          <Link href="/" className="btn">
            Pick a companion
          </Link>
        </div>
      </>
    );
  }

  if (state === "sent") {
    return (
      <>
        <h1>Check your inbox</h1>
        <p role="status">
          We sent a sign-in link to <strong>{email.trim()}</strong>. Open it in this browser to finish signing in.
        </p>
        <p className="muted">Nothing after a minute or two? Check your spam folder, or try again.</p>
        <button type="button" className="btn" onClick={() => setState("idle")}>
          Use a different email
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Sign in</h1>
      <p className="muted">
        Signing in is optional. It saves your transcripts and notes to your history so you can come back to them. No
        password: we email you a link.
      </p>
      {linkFailed && !error && (
        <p className="banner" data-tone="warn" role="alert">
          That sign-in link didn&apos;t work. It may have expired, been used already, or been opened in a different
          browser. Ask for a new one below.
        </p>
      )}
      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12, width: "min(100%, 420px)", textAlign: "left" }}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? "signin-error" : undefined}
          aria-invalid={error ? true : undefined}
          style={{ minHeight: 44, padding: "8px 12px", border: "2px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)" }}
        />
        {error && (
          <p id="signin-error" className="banner" data-tone="danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      <Link href="/" className="btn btn-ghost">
        Continue as a guest
      </Link>
    </>
  );
}
