"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Rig } from "@/components/avatar/Rig";
import { useSession, writeSession } from "@/components/ui/session";
import type { AvatarState, Mood, SessionData } from "@/lib/types";
import type { Snapshot, TranscriptItem, VoiceSession } from "@/lib/voice/session";
import { formatElapsed } from "@/lib/voice/text";
import { useVoiceLevel, useVoiceSession } from "@/lib/voice/useVoiceSession";
import css from "./session.module.css";

export default function SessionPage() {
  const data = useSession();
  if (data === undefined) return <main className="container" aria-busy="true" />;
  if (!data) {
    return (
      <main className="container stage">
        <h1>No session to join yet</h1>
        <p className="muted">Pick a companion and set it up first, then you can start talking.</p>
        <Link href="/" className="btn btn-primary">
          Choose a companion
        </Link>
      </main>
    );
  }
  // The key matters: Next.js keeps this page's state when you navigate away, so without it a new Start would
  // show the previous, already finished session.
  return <SessionView key={data.sessionId ?? "session"} data={data} />;
}

const STT_NOTICE: Record<Exclude<Snapshot["stt"], "ok">, string> = {
  unsupported:
    "This browser can't do voice input, so this session uses typing: write your replies in the box below. Chrome on desktop or Android supports talking.",
  denied:
    "The microphone is blocked or unavailable, so this session uses typing: write your replies in the box below. To talk instead, allow microphone access for this site and reload.",
  failed:
    "Voice recognition stopped working (it needs an internet connection), so this session uses typing: write your replies in the box below.",
};

function statusText(s: Snapshot): string {
  if (!s.started) return "Ready when you are";
  if (s.state === "thinking") return "Thinking…";
  if (s.state === "speaking") return "Speaking…";
  if (s.stt !== "ok") return "Your turn: type your reply";
  if (s.mode === "ptt") return s.micOn ? "Listening… let go to send" : "Your turn: hold to talk";
  if (s.micMuted) return "Your microphone is off";
  return "Listening…";
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function SessionView({ data }: { data: SessionData }) {
  const router = useRouter();
  const { session, ...s } = useVoiceSession(data);
  const { companion } = data;
  const [draft, setDraft] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [seconds, setSeconds] = useState(() => Math.floor(session.elapsed() / 1000));
  const more = useRef<HTMLDivElement>(null);
  const busy = s.state === "thinking" || s.state === "speaking";
  const live = s.started && !s.ended;

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setSeconds(Math.floor(session.elapsed() / 1000)), 500);
    return () => clearInterval(id);
  }, [live, session]);

  // Save the conversation whenever a stretch of talking ends: End session, or leaving the page mid-session.
  useEffect(() => {
    if (!s.ended || !s.started) return;
    const durationMs = session.elapsed();
    if (data.durationMs === durationMs) return; // already saved
    try {
      // `notes` described the conversation as it was before this stretch.
      writeSession({ ...data, messages: session.history(), durationMs, notes: undefined });
    } catch {
      /* storage unavailable: the results page will say there is nothing to show */
    }
  }, [s.ended, s.started, session, data]);

  // Space: hold to talk (push-to-talk mode) or interrupt. Escape: interrupt.
  useEffect(() => {
    const inControl = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      !t.dataset.ptt && // Space on the focused hold-to-talk button is still push-to-talk
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      const now = session.getSnapshot();
      if (!now.started || now.ended) return;
      const talking = now.state === "thinking" || now.state === "speaking";
      if (e.key === "Escape") return void (talking && session.interrupt());
      if (e.code !== "Space" || inControl(e.target)) return;
      e.preventDefault(); // no page scroll
      if (e.repeat) return;
      if (talking) session.interrupt();
      else session.pttDown();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") session.pttUp();
    };
    const blur = () => session.pttUp();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [session]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    session.sendText(draft);
    setDraft("");
    more.current?.hidePopover?.();
  }

  function endSession() {
    const userTurns = s.items.filter((it) => it.role === "user").length;
    const warn = companion.notes
      ? "End the session now? You've only just started, so there won't be much to write notes about."
      : "End the session now?";
    if (userTurns < 2 && !window.confirm(warn)) return;
    session.end();
  }

  function resume() {
    try {
      writeSession({ ...data, notes: undefined }); // the old notes described a shorter conversation
    } catch {
      /* storage unavailable */
    }
    session.start();
  }

  if (s.ended) {
    return (
      <main className="container stage">
        <div className="stage-character">
          <Rig skin={companion.character} state="idle" level={0} mood="happy" />
        </div>
        <h1>Session finished</h1>
        <p className="muted">
          You talked with {companion.name} for {formatElapsed(session.elapsed())}.
          {companion.notes ? " Ready to see how it went?" : ""}
        </p>
        <div className="actions">
          <button
            type="button"
            className={`btn btn-primary ${css.big}`}
            onClick={() => router.push(companion.notes ? "/results" : "/goodbye")}
          >
            {companion.notes ? "Get notes" : "Say goodbye"}
          </button>
          <button type="button" className="btn" onClick={resume}>
            Resume session
          </button>
          <button type="button" className="btn" aria-expanded={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
            {showTranscript ? "Hide transcript" : "View transcript"}
          </button>
          <Link href={`/setup/${data.companionId}`} className="btn">
            Practise again
          </Link>
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        </div>
        {showTranscript ? (
          <div className={css.review}>
            <Transcript items={s.items} interim="" name={companion.name} />
          </div>
        ) : null}
      </main>
    );
  }

  const ptt = s.mode === "ptt";
  const hint = !s.started
    ? `${companion.name} will say hello first. Headphones work best.`
    : s.stt !== "ok"
      ? "Tap the orb to interrupt."
      : ptt
        ? "Hold the button or the Space bar while you talk. Let go to send."
        : "Just talk, and pause when you're done. Tap the orb to interrupt.";
  const speakingNow = busy ? s.items.findLast((it) => it.role === "assistant" && it.pending && !it.error) : undefined;

  const typeForm = (
    <form className={css.form} onSubmit={submit}>
      <label className="sr-only" htmlFor="reply">
        Type a reply
      </label>
      <input
        id="reply"
        className={css.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type a reply"
        autoComplete="off"
        maxLength={2000}
      />
      <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
        Send
      </button>
    </form>
  );

  return (
    <main className={css.page} data-session>
      <header className={css.top}>
        <h1 className={css.title}>{companion.name}</h1>
        {s.started ? (
          <>
            <span className={css.timer} aria-label={`Elapsed time ${formatElapsed(seconds * 1000)}`}>
              {formatElapsed(seconds * 1000)}
            </span>
            <button type="button" className={`btn ${css.small}`} onClick={endSession}>
              End session
            </button>
          </>
        ) : (
          <Link href={`/setup/${data.companionId}`} className={`btn btn-ghost ${css.small}`}>
            Back
          </Link>
        )}
      </header>

      {/* Top right, just under End session. */}
      {s.started ? (
        <button type="button" className={`btn ${css.small} ${css.moreBtn}`} popoverTarget="session-more">
          More
        </button>
      ) : null}

      <div className={css.banners}>
        {s.started && s.stt !== "ok" ? (
          <p className="banner" data-tone="warn" role="status">
            {STT_NOTICE[s.stt]}
          </p>
        ) : null}
        {s.distress ? (
          <p className="banner">
            If you&apos;re going through a hard time, you don&apos;t have to do it alone. Talking to someone you trust or a
            local crisis line can help.{" "}
            <a href="https://findahelpline.com" target="_blank" rel="noreferrer">
              Find a helpline
            </a>
          </p>
        ) : null}
      </div>

      {/* Dead centre and large: the orb is where the eyes should rest, like an interviewer on a video call. */}
      <div className={css.orb}>
        <LiveRig
          session={session}
          skin={companion.character}
          state={s.state}
          mood={s.mood}
          onClick={busy ? () => session.interrupt() : undefined}
          label={`Interrupt ${companion.name}`}
        />
      </div>

      <div className={css.under}>
        <p className={css.status} data-state={s.started ? s.state : "idle"} role="status">
          <span className={css.dot} aria-hidden="true" />
          {statusText(s)}
        </p>
        {captions && speakingNow ? (
          <p className={css.caption} aria-hidden="true">
            {speakingNow.content}
          </p>
        ) : null}
        {/* Keyed so the fade restarts when the hint changes; after a few seconds it gets out of the way. */}
        <p key={hint} className={`muted ${css.hint}`} data-fade={s.started || undefined}>
          {hint}
        </p>
        {s.started && (s.hd === "loading" || s.hd === "failed") ? (
          <p className={`muted ${css.hd}`}>
            {s.hd === "loading"
              ? `Getting the natural voice ready… ${s.hdProgress}%`
              : "The natural voice can't run on this device, so the standard voice is used."}
          </p>
        ) : null}
      </div>

      {/* Hidden by default so eyes stay on the orb. Screen readers still get it. */}
      <div className={showTranscript ? css.panel : "sr-only"}>
        <Transcript items={s.items} interim={s.interim} name={companion.name} />
      </div>

      {s.started && s.stt !== "ok" ? <div className={css.typing}>{typeForm}</div> : null}

      <div className={css.dock}>
        {!s.started ? (
          <button type="button" className={`btn btn-primary ${css.big} ${css.start}`} onClick={() => session.start()}>
            Start talking
          </button>
        ) : (
          <>
            <span />
            {ptt ? (
              <button
                type="button"
                className={css.mic}
                data-ptt="true"
                data-on={s.micOn}
                disabled={s.stt !== "ok"}
                aria-disabled={s.state !== "listening"}
                aria-pressed={s.micOn}
                aria-label="Hold to talk"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  session.pttDown();
                }}
                onPointerUp={() => session.pttUp()}
                onPointerCancel={() => session.pttUp()}
                onContextMenu={(e) => e.preventDefault()}
              >
                <MicIcon off={false} />
              </button>
            ) : (
              <button
                type="button"
                className={css.mic}
                data-on={s.micOn}
                disabled={s.stt !== "ok"}
                aria-pressed={!s.micMuted}
                aria-label={s.stt !== "ok" ? "Microphone unavailable" : s.micMuted ? "Turn microphone on" : "Turn microphone off"}
                onClick={() => session.setMicMuted(!s.micMuted)}
              >
                <MicIcon off={s.micMuted || s.stt !== "ok"} />
              </button>
            )}
            {s.canRetry ? (
              <button type="button" className={`btn ${css.side}`} onClick={() => session.retry()}>
                Retry
              </button>
            ) : !ptt && s.state === "listening" && s.interim.trim() ? (
              // Only while you are mid-answer: send now instead of waiting for the pause.
              <button type="button" className={`btn btn-primary ${css.side}`} onClick={() => session.sendNow()}>
                Done
              </button>
            ) : (
              <span />
            )}
          </>
        )}
      </div>

      <div id="session-more" ref={more} popover="auto" className={css.more}>
        {s.stt === "ok" ? typeForm : null}
        {s.stt === "ok" ? (
          <div className={css.group} role="group" aria-label="How you take your turn">
            <button type="button" className="chip" aria-pressed={!ptt} onClick={() => session.setMode("auto")}>
              Auto-listen
            </button>
            <button type="button" className="chip" aria-pressed={ptt} onClick={() => session.setMode("ptt")}>
              Hold to talk
            </button>
          </div>
        ) : null}
        <div className={css.group}>
          <button type="button" className="chip" aria-pressed={s.muted} onClick={() => session.setMuted(!s.muted)}>
            {s.muted ? "Voice muted" : "Mute voice"}
          </button>
          <label className={css.volume}>
            <span className="sr-only">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.muted ? 0 : s.volume}
              onChange={(e) => session.setVolume(Number(e.target.value))}
            />
          </label>
        </div>
        <div className={css.group}>
          <button type="button" className="chip" aria-pressed={captions} onClick={() => setCaptions((v) => !v)}>
            Captions
          </button>
          <button type="button" className="chip" aria-pressed={showTranscript} onClick={() => setShowTranscript((v) => !v)}>
            Transcript
          </button>
        </div>
      </div>
    </main>
  );
}

/** Subscribes to the ~30fps mouth level on its own so the rest of the page does not re-render with it. */
function LiveRig(props: {
  session: VoiceSession;
  skin: string;
  state: AvatarState;
  mood: Mood;
  onClick?: () => void;
  label: string;
}) {
  const { session, ...rest } = props;
  const level = useVoiceLevel(session);
  return <Rig {...rest} level={level} />;
}

const NEAR_BOTTOM_PX = 48;

function Transcript({ items, interim, name }: { items: TranscriptItem[]; interim: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // false once the user scrolls up, true again when they return to the bottom

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, interim]);

  const done = items.filter((it) => !it.pending);
  const pending = items.filter((it) => it.pending);
  const line = (it: TranscriptItem) => (
    <li key={it.id} className={css.msg} data-role={it.role} data-error={it.error || undefined}>
      <span className={css.who}>{it.role === "user" ? "You" : name}</span>
      <span>
        {it.content}
        {it.interrupted ? <em className={css.note}> (interrupted)</em> : null}
      </span>
    </li>
  );

  return (
    <section
      ref={box}
      className={css.transcript}
      aria-label="Transcript"
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
    >
      {items.length === 0 && !interim ? <p className="muted">The conversation will appear here.</p> : null}
      {/* Only finished lines are in the live region, so a screen reader hears each reply once, complete. */}
      <ol className={css.list} aria-live="polite" aria-relevant="additions">
        {done.map(line)}
      </ol>
      <ol className={css.list}>
        {pending.map(line)}
        {interim ? (
          <li className={css.msg} data-role="user" data-interim="true">
            <span className={css.who}>You</span>
            <span>{interim}…</span>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
