// Thin wrapper over the Web Speech API that hides Chrome's quirks. Browser only.

// lib.dom has no SpeechRecognition typings; this is the subset used here.
type RecResult = { isFinal: boolean; 0: { transcript: string } };
type RecEvent = { resultIndex: number; results: { length: number; [i: number]: RecResult } };
type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  abort(): void;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;

function getCtor(): RecCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const sttSupported = () => !!getCtor();

export type SttHandlers = {
  /** Fired on every result. `text` is everything heard since the last reset(), final + interim. */
  onText(text: string): void;
  /** "denied" = mic blocked; "failed" = recognition keeps dying (offline, no service). */
  onError(kind: "denied" | "failed"): void;
};

const MAX_QUICK_FAILS = 4;

export function createRecognizer(h: SttHandlers) {
  const Ctor = getCtor();
  let rec: Rec | null = null;
  let want = false;
  let committed = ""; // finals from recognition runs that already ended
  let current = ""; // finals + interim of the live run
  let startedAt = 0;
  let quickFails = 0;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

  function open() {
    if (!Ctor || !want) return;
    const r = new Ctor();
    rec = r;
    // Android Chrome repeats earlier text in every result when continuous; one utterance per run avoids it
    // (the onend restart below keeps listening).
    r.continuous = !/Android/i.test(navigator.userAgent);
    r.interimResults = true;
    r.lang = "en-US";
    startedAt = Date.now();
    r.onresult = (e) => {
      if (rec !== r || !want) return;
      let text = "";
      for (let i = 0; i < e.results.length; i++) text = join(text, e.results[i][0].transcript.trim());
      current = text;
      quickFails = 0;
      h.onText(join(committed, current));
    };
    r.onerror = (e) => {
      if (rec !== r) return;
      // "no-speech" and "aborted" are routine; onend follows and restarts.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        want = false;
        h.onError("denied");
      }
    };
    r.onend = () => {
      if (rec !== r) return;
      rec = null;
      committed = join(committed, current);
      current = "";
      if (!want) return;
      // Chrome ends recognition by itself after a pause or ~60s: restart while we still want to listen.
      if (Date.now() - startedAt < 1000 && ++quickFails >= MAX_QUICK_FAILS) {
        want = false;
        h.onError("failed");
        return;
      }
      restartTimer = setTimeout(open, 150);
    };
    try {
      r.start();
    } catch {
      rec = null;
      want = false;
      h.onError("failed");
    }
  }

  return {
    start() {
      if (want) return;
      want = true;
      quickFails = 0;
      open();
    },
    /** Stops immediately and drops anything not yet delivered (abort, not stop: used by the echo guard). */
    stop() {
      want = false;
      clearTimeout(restartTimer);
      const r = rec;
      rec = null;
      try {
        r?.abort();
      } catch {
        /* already stopped */
      }
    },
    /** Returns everything heard since the last take() and clears it. */
    take(): string {
      const text = join(committed, current);
      committed = "";
      current = "";
      return text;
    },
    get active() {
      return want;
    },
  };
}

export type Recognizer = ReturnType<typeof createRecognizer>;
