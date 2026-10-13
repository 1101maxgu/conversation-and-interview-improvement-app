# 001. LLM providers: Gemini, NVIDIA NIM, Bytez behind one module

Status: Accepted, 2026-10-10

## Context
The app needs a chat model for the companions and a JSON-capable model for the notes. The cost per user must be close to zero while the product is unproven. The owner chose which providers to use.

## Decision
All model calls go through `lib/llm.ts`. Providers are tried in order: Gemini Flash first, NVIDIA NIM second, Bytez last. A provider is skipped when it has no key, and the next one is tried on a 429, a 5xx or a timeout. Model names and the order come from environment variables. The Anthropic API is not used: this was the owner's choice of Gemini, NIM and Bytez.

## Consequences
- Switching a model, reordering providers or turning on Gemini billing is a configuration change, not a code change.
- Free-tier limits are disputed and unverified. Gemini Flash is reported at anywhere from about 20 to about 1,500 requests per day, with about 250 cited most often; the NIM trial tier is about 40 requests per minute. A 20-turn session uses about 21 to 22 requests, so a free key supports only a handful of sessions a day.
- Free tiers may use submitted content to improve their products. This is why the privacy line exists (see ADR 005).
- JSON reliability differs between fallback models, so the notes route validates the output and has a stats-only fallback (see ADR 004).
