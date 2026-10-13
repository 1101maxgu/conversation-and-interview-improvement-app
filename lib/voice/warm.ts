// Pre-loads the natural (Kokoro) voice so the one-time download happens while the user fills in the setup form,
// not in the middle of their first conversation. The model files land in the browser's cache; the session's own
// worker then loads them from there in a few seconds.

export type WarmEvents = { progress(pct: number): void; ready(): void; failed(): void };

export function warmNaturalVoice(on: WarmEvents): { cancel(): void } {
  // Same `new Worker(new URL(...), { type: "module" })` shape as lib/voice/tts.ts, which Turbopack bundles.
  const worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  let over = false;
  const finish = (fn: () => void) => {
    if (over) return;
    over = true;
    fn();
    worker.terminate();
  };
  worker.onmessage = (e: MessageEvent<{ type: string; pct?: number }>) => {
    const m = e.data;
    if (over) return;
    if (m.type === "progress") on.progress(m.pct ?? 0);
    else if (m.type === "ready") finish(on.ready);
    else if (m.type === "error") finish(on.failed);
  };
  worker.onerror = () => finish(on.failed);
  worker.postMessage({ type: "load" });
  return {
    cancel() {
      over = true;
      worker.terminate();
    },
  };
}

/** True on connections where a ~300 MB background download would be unkind (data saver, slow mobile). */
export function shouldSkipDownload(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? ""));
}
