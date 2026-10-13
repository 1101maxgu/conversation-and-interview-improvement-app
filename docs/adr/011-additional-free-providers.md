# 011. Additional free providers: Groq, Cerebras and OpenRouter

Status: Accepted, 2026-10-10. Extends [ADR 001](001-llm-providers.md).

## Context
With three providers on free tiers, a handful of sessions a day could exhaust the quota, and the first words of a reply were sometimes slow. More free capacity and faster first tokens were needed without paying and without adding a dependency.

## Decision
Add Groq, Cerebras and OpenRouter (free models) to the provider chain in `lib/llm.ts`. All three speak the same OpenAI-compatible chat-completions API as the existing providers, so each is one data entry in the provider list, not new code paths.

- **Capacity**: each provider has its own free quota, so the chain as a whole can serve more sessions before every provider answers 429.
- **Speed**: Groq and Cerebras run on hardware built for fast inference, which shortens the wait before the companion starts speaking.
- A provider without a key is skipped, so every key is optional as long as one is set. The order and each model can be changed with `LLM_PROVIDER_ORDER` and the `*_MODEL` variables; the defaults, base URLs and what was verified against each provider's documentation are recorded in the header comment of `lib/llm.ts`.

## Consequences
- **Data use**: transcript text is now sent to whichever provider answers, and that may be any of six companies. Free tiers may use submitted content to improve their products, and OpenRouter passes requests on to the underlying model host, which adds another party. The privacy line on the setup page already says text is sent to AI providers and may be used under their terms (ADR 005); it must stay accurate if providers change.
- Free model line-ups and limits change often. When a default model is retired, set the matching `*_MODEL` variable; no code change is needed.
- Answer quality and JSON reliability differ between models, so replies and notes can vary depending on which provider answered. The notes route validates the output and falls back to measured stats (ADR 004), and `npm run eval` reports a pass rate per provider.
- More keys to create and keep in Vercel.
