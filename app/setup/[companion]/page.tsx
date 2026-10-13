"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState } from "react";
import { Character } from "@/components/ui/Character";
import { useUser } from "@/components/ui/auth";
import { APP_NAME } from "@/components/ui/brand";
import { readSession, useCompanions, writeSession } from "@/components/ui/session";
import type { CompanionPublic, OptionGroup, Selections } from "@/lib/types";
import { shouldSkipDownload, warmNaturalVoice } from "@/lib/voice/warm";
import styles from "./page.module.css";

const HD_KEY = "sayable:natural-voice";
/** Companions that get a session-start plan from /api/plan (see lib/agents). */
const PLANNED = new Set(["interview", "case", "sales", "presentation"]);
/** How long Start waits for the plan before starting without it. */
const PLAN_WAIT_MS = 6_000;

type Params = Promise<{ companion: string }>;

// With cacheComponents the route param is request-time data, so reading it needs a Suspense boundary.
export default function SetupPage({ params }: { params: Params }) {
  return (
    <main className="container">
      <Suspense fallback={<Loading />}>
        <Setup params={params} />
      </Suspense>
    </main>
  );
}

function Loading() {
  return (
    <div className={styles.layout}>
      <div className={`skeleton ${styles.character}`} />
      <div className={`skeleton ${styles.formSkeleton}`} />
      <p className="sr-only" role="status">
        Loading
      </p>
    </div>
  );
}

function Setup({ params }: { params: Params }) {
  const { companion: id } = use(params);
  const [state, retry] = useCompanions();

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") {
    return (
      <div className="stage">
        <div className="banner" data-tone="danger" role="alert">
          We couldn&apos;t load this companion. {state.message}
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={retry}>
            Try again
          </button>
          <Link href="/" className="btn">
            Home
          </Link>
        </div>
      </div>
    );
  }

  const companion = state.data.find((c) => c.id === id);
  if (!companion) notFound(); // the layout already 404s unknown ids; this covers a companion removed after the page loaded
  return <SetupForm key={companion.id} companion={companion} />;
}

const value = (sel: Selections, g: OptionGroup) => (sel[g.id] ?? "").trim();

/** Keeps only values that are still valid for this companion's groups. */
function clean(groups: OptionGroup[], sel: Selections): Selections {
  const out: Selections = {};
  for (const g of groups) {
    const v = sel[g.id];
    if (typeof v !== "string") continue;
    if (g.type === "single" ? g.choices?.some((c) => c.id === v) : true) out[g.id] = v.slice(0, g.maxLength);
  }
  return out;
}

const speechSupported = () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window;

function SetupForm({ companion }: { companion: CompanionPublic }) {
  const router = useRouter();
  const { groups } = companion;
  // This component only mounts in the browser (after the fetch), so reading storage here cannot mismatch.
  // "Practise again" lands here: start from the previous choices for the same companion.
  const [sel, setSel] = useState<Selections>(() => {
    const prev = readSession();
    return prev?.companionId === companion.id ? clean(groups, prev.selections ?? {}) : {};
  });
  // On by default (remembered), except on data-saver or slow connections. See lib/voice/warm.ts.
  const [hdVoice, setHdVoice] = useState(() => {
    try {
      const saved = localStorage.getItem(HD_KEY);
      if (saved !== null) return saved === "1";
    } catch {
      /* storage blocked: use the default */
    }
    return !shouldSkipDownload();
  });
  const [warm, setWarm] = useState<{ status: "idle" | "loading" | "ready" | "failed"; pct: number }>({
    status: typeof Worker === "undefined" ? "failed" : "loading",
    pct: 0,
  });
  const [saveError, setSaveError] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // False once the user has left this page, so a slow plan request cannot start a session behind their back.
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  const [voice] = useState(speechSupported);
  const user = useUser();

  useEffect(() => {
    if (!hdVoice || typeof Worker === "undefined") return;
    const job = warmNaturalVoice({
      progress: (pct) => setWarm({ status: "loading", pct }),
      ready: () => setWarm({ status: "ready", pct: 100 }),
      failed: () => setWarm({ status: "failed", pct: 0 }),
    });
    return () => job.cancel();
  }, [hdVoice]);

  const missing = groups.filter((g) => g.required && !value(sel, g));
  const set = (id: string, v: string) => setSel((s) => ({ ...s, [id]: v }));

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length || preparing) return;
    const selections = Object.fromEntries(groups.map((g) => [g.id, value(sel, g)]).filter(([, v]) => v));
    // Some companions get a tailored plan. Any failure or timeout just starts without one.
    let plan: unknown;
    if (PLANNED.has(companion.id)) {
      setPreparing(true);
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companionId: companion.id, selections }),
          signal: AbortSignal.timeout(PLAN_WAIT_MS),
        });
        if (res.ok) plan = await res.json();
      } catch {
        /* no plan: the playbook alone */
      } finally {
        setPreparing(false);
      }
      if (!here.current) return;
    }
    try {
      writeSession({ companionId: companion.id, selections, companion, hdVoice, plan, sessionId: crypto.randomUUID() });
    } catch {
      setSaveError(true);
      return;
    }
    router.push("/session");
  }

  return (
    <div className={styles.layout}>
      <title>{`${companion.name} | ${APP_NAME}`}</title>
      <div className={styles.intro}>
        <Character id={companion.character} mood="happy" className={styles.character} />
        <h1>{companion.name}</h1>
        <p className="muted">{companion.blurb}</p>
      </div>

      <form className={`card ${styles.form}`} onSubmit={start}>
        {groups.some((g) => g.required) && (
          <p className="muted">
            Questions marked <span aria-hidden="true">*</span>
            <span className="sr-only">with a star</span> are needed to start.
          </p>
        )}

        {groups.map((g) => (
          <Group key={g.id} group={g} value={sel[g.id] ?? ""} onChange={(v) => set(g.id, v)} />
        ))}

        <div className={styles.group}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              role="switch"
              checked={hdVoice}
              onChange={(e) => {
                setHdVoice(e.target.checked);
                try {
                  localStorage.setItem(HD_KEY, e.target.checked ? "1" : "0");
                } catch {
                  /* storage blocked: the choice just won't be remembered */
                }
              }}
              aria-describedby="hd-help"
            />
            <span className={styles.label}>Natural voice</span>
          </label>
          <p id="hd-help" className="muted" aria-live="polite">
            {!hdVoice && "Uses your browser's standard voice, which can sound robotic."}
            {hdVoice && warm.status === "loading" &&
              `Getting the natural voice ready (one-time download, about 300 MB): ${warm.pct}%. You can start now; it takes over when it is ready.`}
            {hdVoice && warm.status === "ready" && "Natural voice is ready."}
            {hdVoice && warm.status === "failed" && "The natural voice can't run on this device, so the standard voice will be used."}
          </p>
        </div>

        {!voice && (
          <p className="banner" data-tone="warn">
            Voice works best in Chrome on desktop or Android. In this browser you can type your replies instead.
          </p>
        )}

        <div className={styles.small}>
          <p>Your browser will ask to use your microphone when the session starts, so your companion can hear you.</p>
          <p>
            Your voice is processed by your browser&apos;s speech service. Text is sent to AI providers and may be
            used by them under their terms.
          </p>
          {companion.id === "interview" && (
            <p>Questions are modeled on publicly known interview styles, not inside information.</p>
          )}
          {/* Sessions are saved from the notes page, so this only applies to companions that give notes. */}
          {user && companion.notes && (
            <p>Your transcripts and notes are saved to your account. You can delete them any time.</p>
          )}
        </div>

        {saveError && (
          <p className="banner" data-tone="danger" role="alert">
            We couldn&apos;t save your choices in this browser. Check that site storage isn&apos;t blocked, then try
            again.
          </p>
        )}

        <div className={styles.submit}>
          <button type="submit" className="btn btn-primary" disabled={missing.length > 0 || preparing} aria-describedby="missing">
            {preparing ? "Preparing your session..." : "Start"}
          </button>
          <p id="missing" className="muted" aria-live="polite">
            {missing.length > 0 && `Still needed: ${missing.map((g) => g.label).join(", ")}`}
            {preparing && <span className="sr-only">Preparing your session.</span>}
          </p>
        </div>
      </form>
    </div>
  );
}

function Star() {
  return (
    <span className={styles.star} aria-hidden="true">
      {" *"}
    </span>
  );
}

function Group({ group: g, value, onChange }: { group: OptionGroup; value: string; onChange: (v: string) => void }) {
  const id = `group-${g.id}`;

  if (g.type === "single") {
    return (
      <fieldset className={styles.group} role="radiogroup" aria-labelledby={id} aria-required={g.required}>
        <legend id={id} className={styles.label}>
          {g.label}
          {g.required && <Star />}
        </legend>
        <div className={styles.chips}>
          {g.choices?.map((c) => (
            <label key={c.id} className="chip">
              <input
                type="radio"
                className="sr-only"
                name={g.id}
                value={c.id}
                checked={value === c.id}
                onChange={() => onChange(c.id)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const showCounter = Boolean(g.maxLength && (g.multiline || g.maxLength >= 200));
  const field = {
    id,
    className: styles.input,
    value,
    placeholder: g.placeholder,
    maxLength: g.maxLength,
    required: g.required,
    "aria-describedby": showCounter ? `${id}-count` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <div className={styles.group}>
      <label htmlFor={id} className={styles.label}>
        {g.label}
        {g.required && <Star />}
      </label>
      {g.multiline ? <textarea rows={5} {...field} /> : <input type="text" autoComplete="off" {...field} />}
      {showCounter && (
        <p id={`${id}-count`} className={`muted ${styles.counter}`}>
          {value.length} / {g.maxLength} characters
        </p>
      )}
    </div>
  );
}
