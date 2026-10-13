# 007. Hosting on Vercel with an in-memory rate limiter

Status: Accepted, 2026-10-10. The rate limiter part is superseded by [ADR 010](010-durable-rate-limits.md): limits are now stored in Upstash Redis when it is configured, and the in-memory limiter described here is the fallback.

## Context
The app is a Next.js site with three small API routes. Provider keys must stay secret, and free model quotas are small enough that one abusive client could use them up for everyone.

## Decision
Host on Vercel. API keys live in server environment variables only and are never sent to the browser. Every request body is validated with zod at the route boundary (`lib/guard.ts`), with size caps on messages, free text and transcript length. Rate limits are per client IP and kept in memory: 40 chat requests per minute and 6 notes requests per hour by default, each overridable with a `LIMIT_*` environment variable.

A hosted store (Upstash or Vercel KV) is the planned upgrade, not part of the MVP: it adds an account and setup work before there is any traffic.

## Consequences
- Nothing extra to provision; deployment is setting the environment variables.
- The limiter resets on a cold start and each server instance counts separately, so on Vercel the real limit is looser than the configured number. The code marks this with a `ponytail:` comment naming the upgrade path.
- Clients behind one shared IP (a campus network) share one allowance.
- When every provider reports a rate limit, the routes return 429 with a friendly message so the page can say "try again in a minute".
