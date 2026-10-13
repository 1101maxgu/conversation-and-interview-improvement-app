// The voice session state machine: idle -> listening -> thinking -> speaking -> listening.
// A plain class with an immutable snapshot (React reads it through useVoiceSession), so every
// browser callback sees current state without stale closures.
import type { AvatarState, ChatRequest, Message, Mood, SessionData, Voice } from "@/lib/types";
import { createRecognizer, sttSupported, type Recognizer } from "./stt";
import { createMoodParser, createSentenceSplitter, matchesDistress } from "./text";
import { createSpeaker, type HdStatus, type Speaker } from "./tts";

/** Auto-listen: the user's turn ends after this much silence since the last recognition result. */
export const SILENCE_MS = 1500;
/** Echo guard: wait this long after playback ends before reopening the mic. */
export const ECHO_TAIL_MS = 250;
/** No reply progress for this long -> give up, so the UI can never stay in `thinking`. */
export const REPLY_TIMEOUT_MS = 30_000;
/** Push-to-talk: keep listening this long after release so the last word is not clipped. */
export const PTT_RELEASE_MS = 350;

/** The server rejects longer messages (LIMIT_MAX_MESSAGE_CHARS in lib/guard.ts). */
const MAX_TURN_CHARS = 2000;

const FALLBACK_LINE = "Sorry, I lost my train of thought for a moment. Tap Retry, or just say that again.";

export type InputMode = "auto" | "ptt";
/** ok | unsupported (no Web Speech API) | denied (mic blocked or missing) | failed (recognition keeps dying) */
export type SttStatus = "ok" | "unsupported" | "denied" | "failed";

export type TranscriptItem = Message & {
  id: number;
  /** Still streaming / being spoken. */
  pending?: boolean;
  /** The user cut this reply short; `content` is what had been shown. */
  interrupted?: boolean;
  /** A local "something went wrong" line, never sent to the server or saved. */
  error?: boolean;
};

export type Snapshot = {
  state: AvatarState;
  started: boolean;
  ended: boolean;
  items: TranscriptItem[];
  /** What the mic has heard so far this turn. */
  interim: string;
  mood: Mood;
  mode: InputMode;
  stt: SttStatus;
  micOn: boolean;
  /** The user switched their own microphone off (Auto-listen). */
  micMuted: boolean;
  muted: boolean;
  volume: number;
  hd: HdStatus;
  hdProgress: number;
  canRetry: boolean;
  distress: boolean;
};

type Latency = { speechEnd: number; turnEnd: number; requestSent?: number; firstToken?: number; logged?: boolean };

export class VoiceSession {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private level = 0;
  private levelListeners = new Set<() => void>();

  private speaker: Speaker | null = null;
  private rec: Recognizer | null = null;
  /** Bumped whenever the current reply is finished, failed or interrupted; stale async work checks it. */
  private turn = 0;
  private abort: AbortController | null = null;
  private streamDone = true;
  private startedAt = 0;
  /** Time talked before this stretch: a resumed session carries on from here. */
  private offset = 0;
  /** True from Resume until the companion's welcome-back reply has arrived. */
  private resuming = false;
  private lastHeardAt = 0;
  private nextId = 1;
  private pttHeld = false;
  private lat: Latency | null = null;

  private silenceTimer?: ReturnType<typeof setTimeout>;
  private tailTimer?: ReturnType<typeof setTimeout>;
  private replyTimer?: ReturnType<typeof setTimeout>;
  private pttTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private data: SessionData,
    private voice: Voice,
  ) {
    // A session that already ended (reload, or coming back from the notes) opens on its end page, ready to resume.
    const prior = data.messages ?? [];
    this.offset = data.durationMs ?? 0;
    this.snap = {
      state: "idle",
      started: false,
      ended: prior.length > 0,
      items: prior.map((m) => ({ ...m, id: this.nextId++ })),
      interim: "",
      mood: "neutral",
      mode: "auto",
      stt: "ok",
      micOn: false,
      micMuted: false,
      muted: false,
      volume: 1,
      hd: data.hdVoice ? "loading" : "off",
      hdProgress: 0,
      canRetry: false,
      distress: false,
    };
  }

  // ---- store --------------------------------------------------------------

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };
  getSnapshot = () => this.snap;
  subscribeLevel = (cb: () => void) => {
    this.levelListeners.add(cb);
    return () => void this.levelListeners.delete(cb);
  };
  getLevel = () => this.level;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }
  private setLevel = (level: number) => {
    if (level === this.level) return;
    this.level = level;
    this.levelListeners.forEach((l) => l());
  };
  private patchItem(id: number, patch: Partial<TranscriptItem>) {
    this.set({ items: this.snap.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  }
  private now = () => this.offset + Date.now() - this.startedAt;
  /** Total time talked, across resumes. */
  elapsed = () => (this.snap.started && !this.snap.ended ? this.now() : this.offset);
  private get busy() {
    return this.snap.state === "thinking" || this.snap.state === "speaking";
  }

  // ---- lifecycle ----------------------------------------------------------

  /**
   * Call from a click: browsers only unlock audio and the mic prompt inside a user gesture.
   * On a session that has ended this resumes it: same transcript, the clock carries on.
   */
  start() {
    if (this.snap.started && !this.snap.ended) return;
    this.resuming = this.snap.ended;
    this.startedAt = Date.now();
    this.speaker = createSpeaker(this.voice, this.data.hdVoice, {
      onLevel: this.setLevel,
      onStart: this.onAudioStart,
      onIdle: this.onTtsIdle,
      onHd: (hd, hdProgress) => this.set({ hd, hdProgress }),
    });
    this.speaker.unlock();
    this.applyVolume();

    let stt: SttStatus = "unsupported";
    if (sttSupported()) {
      stt = "ok";
      this.rec = createRecognizer({ onText: this.onHeard, onError: (kind) => this.micLost(kind) });
      // Ask for the mic now, during the greeting, instead of when the user is first expected to speak.
      navigator.mediaDevices?.getUserMedia({ audio: true }).then(
        (stream) => stream.getTracks().forEach((t) => t.stop()),
        () => this.micLost("denied"),
      );
    }
    this.set({ started: true, ended: false, stt, micMuted: false });
    this.lat = { speechEnd: Date.now(), turnEnd: Date.now() };
    void this.runAssistant();
  }

  /** Stops everything and returns what should be saved. */
  end(): { messages: Message[]; durationMs: number } {
    const durationMs = (this.offset = this.elapsed());
    this.destroy();
    this.set({
      ended: true,
      state: "idle",
      interim: "",
      canRetry: false,
      items: this.snap.items.map((it) => (it.pending ? { ...it, pending: false, interrupted: true } : it)),
    });
    return { messages: this.history(), durationMs };
  }

  /** Releases the mic, audio, worker, fetch and timers. Safe to call more than once. */
  destroy() {
    this.turn++;
    this.abort?.abort();
    this.streamDone = true;
    clearTimeout(this.replyTimer);
    this.stopMic();
    this.speaker?.destroy();
    this.speaker = null;
    this.rec = null;
    this.setLevel(0);
  }

  /** Tab hidden or page unloading. */
  pause() {
    if (!this.snap.started || this.snap.ended) return;
    if (this.busy) this.interrupt();
    this.stopMic();
  }
  resume() {
    if (this.snap.started && !this.snap.ended && this.snap.state === "listening") this.openMic();
  }

  // ---- microphone ---------------------------------------------------------

  private openMic() {
    const s = this.snap;
    if (s.state !== "listening" || s.ended || s.stt !== "ok" || !this.rec || document.hidden) return;
    if (s.mode === "ptt" ? !this.pttHeld : s.micMuted) return;
    this.rec.take(); // drop anything left over from before
    this.rec.start();
    if (!s.micOn) this.set({ micOn: true });
  }

  private stopMic() {
    clearTimeout(this.silenceTimer);
    clearTimeout(this.tailTimer);
    clearTimeout(this.pttTimer);
    this.rec?.stop();
    this.rec?.take();
    if (this.snap.micOn) this.set({ micOn: false });
  }

  private micLost(kind: "denied" | "failed") {
    if (this.snap.stt !== "ok") return;
    this.stopMic();
    this.set({ stt: kind, interim: "" });
  }

  private onHeard = (text: string) => {
    // Echo guard, second line of defence: ignore anything that arrives outside the user's turn.
    if (this.snap.state !== "listening" || !this.snap.micOn) return;
    this.lastHeardAt = Date.now();
    this.set({ interim: text });
    if (this.snap.mode === "auto") {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => this.sendNow(), SILENCE_MS);
    }
  };

  /** State -> listening; the mic reopens after the echo tail. */
  private listen() {
    this.set({ state: "listening", interim: "" });
    clearTimeout(this.tailTimer);
    this.tailTimer = setTimeout(() => this.openMic(), ECHO_TAIL_MS);
  }

  // ---- user input ---------------------------------------------------------

  /** End the spoken turn now (Send button, silence timeout). */
  sendNow() {
    if (this.snap.state !== "listening") return;
    const text = this.rec?.take().trim();
    if (text) this.sendTurn(text, this.lastHeardAt);
  }

  /** A typed turn. Works in any state: typing over the companion interrupts it. */
  sendText(raw: string) {
    const text = raw.trim();
    if (!text || !this.snap.started || this.snap.ended) return;
    if (this.busy) this.interrupt();
    this.sendTurn(text, Date.now());
  }

  setMode(mode: InputMode) {
    if (mode === this.snap.mode) return;
    this.pttHeld = false;
    this.stopMic();
    this.set({ mode, interim: "" });
    this.openMic();
  }

  pttDown() {
    if (this.snap.mode !== "ptt" || this.snap.state !== "listening") return;
    this.pttHeld = true;
    clearTimeout(this.pttTimer);
    if (!this.snap.micOn) {
      clearTimeout(this.tailTimer);
      this.openMic();
    }
  }

  pttUp() {
    if (!this.pttHeld) return;
    this.pttHeld = false;
    clearTimeout(this.pttTimer);
    this.pttTimer = setTimeout(() => {
      if (this.snap.state !== "listening") return;
      const text = this.rec?.take().trim();
      this.stopMic();
      if (text) this.sendTurn(text, this.lastHeardAt);
      else this.set({ interim: "" });
    }, PTT_RELEASE_MS);
  }

  /** Auto-listen: switch the user's own microphone off and on. */
  setMicMuted(micMuted: boolean) {
    this.set({ micMuted, interim: micMuted ? "" : this.snap.interim });
    if (micMuted) this.stopMic();
    else this.openMic();
  }

  setMuted(muted: boolean) {
    this.set({ muted });
    this.applyVolume();
  }
  setVolume(volume: number) {
    this.set({ volume, muted: false });
    this.applyVolume();
  }
  private applyVolume() {
    this.speaker?.setVolume(this.snap.muted ? 0 : this.snap.volume);
  }

  /** Stop the companion mid-thought or mid-sentence and hand the turn back to the user. */
  interrupt() {
    if (!this.busy) return;
    this.turn++; // anything still in flight for the old turn is now stale
    this.abort?.abort();
    this.streamDone = true;
    clearTimeout(this.replyTimer);
    this.speaker?.stop();
    this.setLevel(0);
    const t = this.now();
    this.set({
      items: this.snap.items
        .filter((it) => !it.pending || it.content.trim())
        .map((it) => (it.pending ? { ...it, pending: false, interrupted: true, t } : it)),
    });
    this.listen();
  }

  /** Ask again for the reply that failed (resends the conversation up to the last user turn). */
  retry() {
    if (!this.snap.canRetry || this.snap.ended) return;
    this.turn++;
    this.speaker?.stop();
    this.stopMic();
    const items = [...this.snap.items];
    while (items.length && items[items.length - 1].role === "assistant") items.pop();
    this.set({ items, interim: "" });
    this.lat = { speechEnd: Date.now(), turnEnd: Date.now() };
    void this.runAssistant();
  }

  // ---- companion turn -----------------------------------------------------

  history(): Message[] {
    return this.snap.items
      .filter((it) => !it.error && it.content.trim())
      .map(({ role, content, t }) => ({ role, content: content.trim(), t }));
  }

  private sendTurn(text: string, spokeAt: number) {
    this.stopMic();
    text = text.slice(0, MAX_TURN_CHARS);
    // t = when the user stopped speaking (not when the silence timeout fired), so pace stats stay honest.
    const item: TranscriptItem = { id: this.nextId++, role: "user", content: text, t: this.offset + Math.max(0, spokeAt - this.startedAt) };
    this.set({
      items: [...this.snap.items, item],
      interim: "",
      distress: this.snap.distress || matchesDistress(text),
    });
    this.lat = { speechEnd: spokeAt, turnEnd: Date.now() };
    void this.runAssistant();
  }

  private armReplyTimer(turn: number) {
    clearTimeout(this.replyTimer);
    this.replyTimer = setTimeout(() => this.fail(turn, null), REPLY_TIMEOUT_MS);
  }

  private async runAssistant() {
    const turn = ++this.turn;
    this.abort?.abort();
    const abort = (this.abort = new AbortController());
    this.streamDone = false;
    this.set({ state: "thinking", canRetry: false });
    this.armReplyTimer(turn);

    const body: ChatRequest = {
      companionId: this.data.companionId,
      selections: this.data.selections,
      plan: this.data.plan,
      messages: this.history(),
      resume: this.resuming || undefined,
    };
    let itemId = 0;
    let content = "";
    const feed = (text: string) => {
      if (!text) return;
      if (!content) {
        text = text.trimStart();
        if (!text) return;
        if (this.lat) this.lat.firstToken = Date.now();
        itemId = this.nextId++;
        const item: TranscriptItem = { id: itemId, role: "assistant", content: "", t: this.now(), pending: true };
        this.snap = { ...this.snap, items: [...this.snap.items, item] };
      }
      content += text;
      this.patchItem(itemId, { content });
    };

    try {
      if (this.lat) this.lat.requestSent = Date.now();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (turn !== this.turn) return;
      if (!res.ok || !res.body) {
        const err: unknown = await res.json().catch(() => null);
        const msg = (err as { error?: unknown } | null)?.error;
        // 429 = rate limit or the session's turn cap: the server's wording is written for the user.
        return this.fail(turn, res.status === 429 && typeof msg === "string" ? msg : null);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const mood = createMoodParser();
      const sentences = createSentenceSplitter();
      const take = (text: string) => {
        feed(text);
        if (content) for (const s of sentences.push(text)) this.speaker?.speak(s);
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (turn !== this.turn) return;
        if (done) break;
        this.armReplyTimer(turn);
        take(mood.push(decoder.decode(value, { stream: true })));
        if (mood.mood && mood.mood !== this.snap.mood) this.set({ mood: mood.mood });
      }
      take(mood.end());
      if (!content.trim()) return this.fail(turn, null);
      this.resuming = false;
      for (const s of sentences.flush()) this.speaker?.speak(s);

      clearTimeout(this.replyTimer);
      this.streamDone = true;
      if (!this.speaker?.busy()) this.finishTurn(turn);
    } catch {
      if (turn === this.turn) this.fail(turn, null);
    }
  }

  private onAudioStart = () => {
    if (this.snap.state !== "thinking") return;
    this.set({ state: "speaking" });
    const l = this.lat;
    if (l && !l.logged && process.env.NODE_ENV !== "production") {
      l.logged = true;
      const now = Date.now();
      const since = (a?: number, b?: number) => (a !== undefined && b !== undefined ? a - b : null);
      console.debug("[voice latency ms]", {
        silenceWait: l.turnEnd - l.speechEnd,
        turnEndToRequest: since(l.requestSent, l.turnEnd),
        requestToFirstToken: since(l.firstToken, l.requestSent),
        firstTokenToFirstAudio: since(now, l.firstToken),
        speechEndToFirstAudio: now - l.speechEnd,
        turnEndToFirstAudio: now - l.turnEnd,
        engine: this.snap.hd === "ready" ? "kokoro" : "speechSynthesis",
      });
    }
  };

  private onTtsIdle = () => {
    if (this.streamDone && this.busy) this.finishTurn(this.turn);
  };

  private finishTurn(turn: number) {
    if (turn !== this.turn || !this.busy) return;
    clearTimeout(this.replyTimer);
    this.setLevel(0);
    // t = when the companion stopped talking, so the gap to the next user message is the user's own time.
    const t = this.now();
    this.snap = {
      ...this.snap,
      items: this.snap.items.map((it) => (it.pending ? { ...it, pending: false, t } : it)),
    };
    this.listen();
  }

  private fail(turn: number, serverMessage: string | null) {
    if (turn !== this.turn) return;
    const mine = ++this.turn; // stops the stream loop
    this.abort?.abort();
    clearTimeout(this.replyTimer);
    this.speaker?.stop();
    const line = serverMessage ?? FALLBACK_LINE;
    const items = this.snap.items
      .filter((it) => !it.pending || it.content.trim())
      .map((it) => (it.pending ? { ...it, pending: false, interrupted: true } : it));
    items.push({ id: this.nextId++, role: "assistant", content: line, t: this.now(), pending: true, error: true });
    this.set({ items, canRetry: true, state: "thinking" });
    this.streamDone = true;
    this.speaker?.speak(line);
    if (!this.speaker?.busy()) this.finishTurn(mine);
  }
}
