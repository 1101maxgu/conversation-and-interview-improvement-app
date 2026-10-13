// Web Worker: loads Kokoro (kokoro-js) and synthesises one sentence per request.
// Protocol (see KokoroEngine in tts.ts):
//   in : { type: "load" } | { type: "speak", id, text, voice } | { type: "cancel", before }
//   out: { type: "progress", pct } | { type: "ready", device } | { type: "audio", id, samples, sampleRate }
//        | { type: "error", message, id? }
import { KokoroTTS, type GenerateOptions } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type In =
  | { type: "load" }
  | { type: "speak"; id: number; text: string; voice: string }
  | { type: "cancel"; before: number };

// tsconfig has the "dom" lib, not "webworker", so `self` is typed as Window. This is the worker scope we use.
const ctx = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<In>) => void) | null;
};

let tts: KokoroTTS | null = null;
let cancelBefore = 0;
let chain: Promise<void> = Promise.resolve();

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadOn(device: "webgpu" | "wasm") {
  const files = new Map<string, { loaded: number; total: number }>();
  let lastPct = -1;
  const model = await KokoroTTS.from_pretrained(MODEL_ID, {
    device,
    dtype: device === "webgpu" ? "fp32" : "q8",
    progress_callback: (p) => {
      if (p.status !== "progress") return;
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      const pct = total ? Math.floor((loaded / total) * 100) : 0;
      if (pct !== lastPct) ctx.postMessage({ type: "progress", pct: (lastPct = pct) });
    },
  });
  // Warm-up: compiles WebGPU shaders now rather than during the first real sentence, and proves synthesis works.
  await model.generate("Hi.", { voice: "af_heart" });
  return model;
}

async function load() {
  const order: ("webgpu" | "wasm")[] = (await hasWebGpu()) ? ["webgpu", "wasm"] : ["wasm"];
  let lastError: unknown;
  for (const device of order) {
    try {
      tts = await loadOn(device);
      ctx.postMessage({ type: "ready", device });
      return;
    } catch (e) {
      lastError = e;
    }
  }
  ctx.postMessage({ type: "error", message: String(lastError) });
}

async function speak(id: number, text: string, voice: string) {
  // Yield so a queued "cancel" is seen before starting work that is already stale.
  await new Promise((r) => setTimeout(r, 0));
  if (id < cancelBefore) return;
  try {
    if (!tts) throw new Error("model not loaded");
    const audio = await tts.generate(text, { voice: voice as GenerateOptions["voice"] });
    if (id < cancelBefore) return;
    const samples = audio.audio as Float32Array<ArrayBuffer>;
    ctx.postMessage({ type: "audio", id, samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
  } catch (e) {
    ctx.postMessage({ type: "error", id, message: String(e) });
  }
}

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === "cancel") cancelBefore = m.before;
  else if (m.type === "load") chain = chain.then(load);
  else if (m.type === "speak") chain = chain.then(() => speak(m.id, m.text, m.voice));
};
