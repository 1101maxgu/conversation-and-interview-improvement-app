// Text-to-speech: two engines (browser speechSynthesis, Kokoro in a worker) behind one small interface.
// Both speak sentence by sentence from their own queue so stop() is immediate and nothing stale can play.
import type { Voice } from "@/lib/types";
import { pickVoice, rmsLevel, simulatedLevel } from "./text";

export type EngineEvents = {
  /** Mouth level 0-1, ~30 times a second while audio plays; 0 when it stops. */
  onLevel(level: number): void;
  /** Audio for a sentence actually started. */
  onStart(): void;
  /** The queue drained: nothing is playing or pending. */
  onIdle(): void;
};

export type Engine = {
  speak(sentence: string): void;
  stop(): void;
  busy(): boolean;
  setVolume(v: number): void;
};

export type HdStatus = "off" | "loading" | "ready" | "failed";

const LEVEL_INTERVAL_MS = 33;
/** If Kokoro produces nothing for this long while a sentence is waiting, give up on HD. */
const HD_STALL_MS = 12_000;
/** How long the first line of a session waits for the natural voice before the browser voice speaks it instead. */
const FIRST_LINE_WAIT_MS = 7_000;

// ---- speechSynthesis ------------------------------------------------------

export function createBrowserEngine(voice: Voice, ev: EngineEvents): Engine {
  const synth: SpeechSynthesis | undefined = typeof window === "undefined" ? undefined : window.speechSynthesis;
  let queue: string[] = [];
  let gen = 0;
  let speaking = false;
  let volume = 1;
  let current: SpeechSynthesisUtterance | null = null; // held so Chrome cannot GC it before onend fires
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let levelTimer: ReturnType<typeof setInterval> | undefined;
  let lastBoundary = 0;

  synth?.getVoices(); // Chrome loads voices asynchronously; the first call kicks that off.

  function stopLevel() {
    clearInterval(levelTimer);
    levelTimer = undefined;
    ev.onLevel(0);
  }

  function next() {
    const text = queue.shift();
    if (text === undefined || !synth) {
      queue = [];
      speaking = false;
      current = null;
      ev.onIdle();
      return;
    }
    speaking = true;
    const my = gen;
    const u = new SpeechSynthesisUtterance(text);
    current = u;
    const v = pickVoice(synth.getVoices(), voice.browserVoiceHints);
    if (v) u.voice = v;
    u.lang = v?.lang ?? "en-US";
    u.pitch = voice.pitch ?? 1;
    u.rate = voice.rate ?? 1;
    u.volume = volume;

    let finished = false;
    const done = () => {
      if (finished || my !== gen) return;
      finished = true;
      clearTimeout(watchdog);
      stopLevel();
      next();
    };
    u.onstart = () => {
      if (my !== gen) return;
      const t0 = performance.now();
      lastBoundary = t0;
      clearInterval(levelTimer);
      levelTimer = setInterval(() => {
        const now = performance.now();
        ev.onLevel(simulatedLevel(now - t0, now - lastBoundary));
      }, LEVEL_INTERVAL_MS);
      ev.onStart();
    };
    u.onboundary = () => {
      lastBoundary = performance.now();
    };
    u.onend = done;
    u.onerror = done;
    // Chrome sometimes never fires onend (stalled synthesis): move on after a generous estimate.
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (my !== gen || finished) return;
      synth.cancel();
      done();
    }, 5000 + text.length * 130);
    synth.speak(u);
  }

  return {
    speak(sentence) {
      queue.push(sentence);
      if (!speaking) next();
    },
    stop() {
      gen++;
      queue = [];
      speaking = false;
      if (current) current.onend = current.onerror = current.onstart = null;
      current = null;
      clearTimeout(watchdog);
      stopLevel();
      synth?.cancel();
    },
    busy: () => speaking,
    // ponytail: an utterance's volume is fixed when it starts, so this applies from the next sentence.
    setVolume(v) {
      volume = v;
    },
  };
}

// ---- Kokoro (HD) ----------------------------------------------------------

type WorkerOut =
  | { type: "progress"; pct: number }
  | { type: "ready"; device: string }
  | { type: "audio"; id: number; samples: Float32Array<ArrayBuffer>; sampleRate: number }
  | { type: "error"; id?: number; message: string };

type KokoroEvents = EngineEvents & {
  onProgress(pct: number): void;
  onReady(): void;
  /** Load or synthesis failed. `pending` = sentences accepted but never played. The engine is dead afterwards. */
  onFail(pending: string[]): void;
};

export function createKokoroEngine(voice: Voice, ctx: AudioContext, ev: KokoroEvents): Engine & { destroy(): void } {
  type Item = { id: number; text: string; buffer?: AudioBuffer };
  let queue: Item[] = [];
  let seq = 0;
  let gen = 0;
  let dead = false;
  let playing: AudioBufferSourceNode | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let levelTimer: ReturnType<typeof setInterval> | undefined;

  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  gain.connect(analyser);
  analyser.connect(ctx.destination);
  const samples = new Float32Array(analyser.fftSize);

  // This exact `new Worker(new URL(...), { type: "module" })` shape is what Turbopack detects and bundles.
  const worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });

  function stopLevel() {
    clearInterval(levelTimer);
    levelTimer = undefined;
    ev.onLevel(0);
  }

  function halt() {
    gen++;
    queue = [];
    clearTimeout(stallTimer);
    if (playing) {
      playing.onended = null;
      try {
        playing.stop();
      } catch {
        /* never started */
      }
      playing = null;
    }
    stopLevel();
  }

  function fail() {
    if (dead) return;
    const pending = queue.slice(playing ? 1 : 0).map((q) => q.text);
    halt();
    dead = true;
    worker.terminate();
    ev.onFail(pending);
  }

  function armStall() {
    clearTimeout(stallTimer);
    if (queue.length && !playing) stallTimer = setTimeout(fail, HD_STALL_MS);
  }

  function pump() {
    const item = queue[0];
    if (playing || !item?.buffer) return armStall();
    clearTimeout(stallTimer);
    const my = gen;
    const src = ctx.createBufferSource();
    src.buffer = item.buffer;
    src.connect(gain);
    src.onended = () => {
      if (my !== gen) return;
      playing = null;
      queue.shift();
      if (queue.length) return pump();
      stopLevel();
      ev.onIdle();
    };
    playing = src;
    src.start();
    if (!levelTimer) {
      levelTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        ev.onLevel(rmsLevel(samples));
      }, LEVEL_INTERVAL_MS);
    }
    ev.onStart();
  }

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (dead) return;
    if (m.type === "progress") ev.onProgress(m.pct);
    else if (m.type === "ready") ev.onReady();
    else if (m.type === "error") fail();
    else if (m.type === "audio") {
      const item = queue.find((q) => q.id === m.id);
      if (!item) return; // stale: its turn was stopped
      const buffer = ctx.createBuffer(1, m.samples.length, m.sampleRate);
      buffer.copyToChannel(m.samples, 0);
      item.buffer = buffer;
      pump();
    }
  };
  worker.onerror = fail;
  worker.postMessage({ type: "load" });

  return {
    speak(sentence) {
      if (dead) return;
      const id = ++seq;
      queue.push({ id, text: sentence });
      worker.postMessage({ type: "speak", id, text: sentence, voice: voice.kokoroVoice });
      if (!playing) armStall();
    },
    stop() {
      if (dead) return;
      worker.postMessage({ type: "cancel", before: seq + 1 });
      halt();
    },
    busy: () => queue.length > 0,
    setVolume(v) {
      gain.gain.value = v;
    },
    destroy() {
      halt();
      dead = true;
      worker.terminate();
    },
  };
}

// ---- Speaker: what the session talks to -----------------------------------

export type SpeakerEvents = EngineEvents & { onHd(status: HdStatus, pct: number): void };

/**
 * Starts on speechSynthesis. With `hd`, Kokoro loads in the background and takes over for the first
 * sentence spoken after it is ready while the browser voice is silent (so never mid-reply).
 */
export function createSpeaker(voice: Voice, hd: boolean, ev: SpeakerEvents) {
  const browser = createBrowserEngine(voice, ev);
  let kokoro: ReturnType<typeof createKokoroEngine> | null = null;
  let ctx: AudioContext | null = null;
  let hdReady = false;
  let volume = 1;
  // The very first line of a session waits briefly for the natural voice, so the greeting is not the robotic one.
  let waitingForHd = hd;
  let held: string[] = [];
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  function speakNow(sentence: string) {
    const useHd = hdReady && kokoro && (kokoro.busy() || !browser.busy());
    (useHd && kokoro ? kokoro : browser).speak(sentence);
  }

  function release() {
    waitingForHd = false;
    clearTimeout(holdTimer);
    const lines = held;
    held = [];
    lines.forEach(speakNow);
  }

  function hdFailed(pending: string[]) {
    hdReady = false;
    kokoro = null;
    ev.onHd("failed", 0);
    release();
    if (pending.length) pending.forEach((s) => browser.speak(s));
    else if (!browser.busy() && !held.length) ev.onIdle();
  }

  return {
    /** Must be called from a user gesture: unlocks speechSynthesis and the AudioContext. */
    unlock() {
      try {
        const primer = new SpeechSynthesisUtterance(" ");
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      } catch {
        /* no speechSynthesis: the transcript still shows every reply */
      }
      if (!hd || kokoro) return;
      try {
        ctx = new AudioContext();
        void ctx.resume();
        kokoro = createKokoroEngine(voice, ctx, {
          ...ev,
          onProgress: (pct) => ev.onHd("loading", pct),
          onReady: () => {
            hdReady = true;
            ev.onHd("ready", 100);
            release();
          },
          onFail: hdFailed,
        });
        kokoro.setVolume(volume);
        ev.onHd("loading", 0);
      } catch {
        hdFailed([]);
      }
    },
    speak(sentence: string) {
      if (waitingForHd && kokoro) {
        held.push(sentence);
        if (!holdTimer) holdTimer = setTimeout(release, FIRST_LINE_WAIT_MS);
        return;
      }
      speakNow(sentence);
    },
    stop() {
      held = [];
      waitingForHd = false;
      clearTimeout(holdTimer);
      browser.stop();
      kokoro?.stop();
    },
    busy: () => held.length > 0 || browser.busy() || !!kokoro?.busy(),
    setVolume(v: number) {
      volume = v;
      browser.setVolume(v);
      kokoro?.setVolume(v);
    },
    destroy() {
      held = [];
      clearTimeout(holdTimer);
      browser.stop();
      kokoro?.destroy();
      kokoro = null;
      hdReady = false;
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

export type Speaker = ReturnType<typeof createSpeaker>;
