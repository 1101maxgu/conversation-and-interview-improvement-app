"use client";

import Link from "next/link";
import { accountsEnabled, useUser } from "./auth";

/**
 * Header links: "Sign in" for guests, "History" and "Sign out" when signed in, nothing when accounts are not
 * configured. A client component on purpose: the root layout stays a static shell (no cookie read on the server).
 */
export function AuthNav() {
  const user = useUser();
  if (!accountsEnabled || user === undefined) return null;

  return (
    <nav aria-label="Account" className="actions">
      {user ? (
        <>
          <Link href="/history" className="btn btn-ghost">
            History
          </Link>
          {/* A real form POST: signing out must not be triggerable by a link, and the full reload resets all state. */}
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </>
      ) : (
        <Link href="/signin" className="btn btn-ghost">
          Sign in
        </Link>
      )}
    </nav>
  );
}
