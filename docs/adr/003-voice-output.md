# 003. Voice output: browser speech by default, Kokoro as optional HD voice

Status: Accepted, 2026-10-10

## Context
The companion must start speaking quickly, and each companion should sound different. Paying a text-to-speech provider for every sentence would put a cost on every user.

## Decision
The default voice is the browser's built-in `speechSynthesis`, which starts instantly. An optional "HD voice" uses Kokoro (`kokoro-js`, Apache-2.0, WebGPU with a WASM fallback, quantized). It downloads in the background and takes over when ready; any failure falls back to the browser voice. Each companion has one fixed voice, looked up in the registry in `lib/voices.ts`.

Rejected:
- Paid cloud text-to-speech: a per-user cost.
- VoiceStudio: it is a desktop studio app, needs a GPU server, is AGPL licensed, and has no documented real-time streaming.

## Consequences
- Voice output costs nothing per user and no reply text goes to a speech provider.
- HD voice quality and start-up time depend on the user's device; the download is large, so it is off by default.
- The browser voice gives no audio stream, so lip-sync uses a simulated level for it.
- Adding a voice later is a data edit in the registry. A voice picker is not part of the MVP.
