"use client";

import Link from "next/link";
import { Character } from "@/components/ui/Character";
import { APP_NAME } from "@/components/ui/brand";
import { useSession } from "@/components/ui/session";

// The Friend companion's ending: a farewell only. No stats, labels or notes by design.
export default function GoodbyePage() {
  const session = useSession();
  return (
    <main className="container stage">
      <title>{`See you soon | ${APP_NAME}`}</title>
      <Character id={session?.companion.character ?? "friend"} mood="happy" className="stage-character" />
      <h1>Thanks for the chat!</h1>
      <p className="muted">That was lovely. Come back whenever you feel like talking.</p>
      <div className="actions">
        <Link href={`/setup/${session?.companionId ?? "friend"}`} className="btn btn-primary">
          Practise again
        </Link>
        <Link href="/" className="btn">
          Home
        </Link>
      </div>
    </main>
  );
}
