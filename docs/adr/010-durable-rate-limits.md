# 010. Durable rate limits with Upstash Redis, failing open

Status: Accepted, 2026-10-10. Replaces the in-memory-only limiter of [ADR 007](007-hosting-and-rate-limiting.md); the rest of ADR 007 stands.

## Context
The in-memory limiter resets on every cold start and counts separately in each server instance, so on Vercel the real limit was looser than the configured one. Free model quotas are small enough that one abusive client could use them up for everyone.

## Decision
`rateLimit` in `lib/guard.ts` is async. When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set it uses `@upstash/ratelimit` with a sliding window, one key prefix per bucket (`rl:chat`, `rl:notes`, `rl:sessions`). Upstash was chosen because its free tier is enough for this traffic and it is called over HTTPS, which suits serverless functions (no connection pool).

- **Identity**: the signed-in user's id when there is one, otherwise the client IP. Signed-in users on a shared network no longer share one allowance, and changing IP does not reset a user's count.
- **Fail open**: if Upstash throws, or does not answer within 1.5 seconds, that request is checked by the in-memory limiter instead and one warning is logged. A limiter outage must never lock users out of the product; the in-memory limiter still gives some protection while it lasts.
- **No environment variables**: the in-memory limiter is used, which is right for local development and tests.
- The 429 response is unchanged: a `Retry-After` header and an `{ error }` body.

## Consequences
- Limits survive restarts and are shared across instances once the two values are set in Vercel.
- Every limited request costs one Upstash round trip (a few Redis commands). At the reported free allowance of about 500,000 commands a month this is far above expected traffic, but it is a number to watch.
- While Upstash is down, limits are as loose as they were before this change. That is the accepted price of failing open.
- Guests behind one shared IP still share one allowance.
- Looking up the user for the chat and notes limits verifies the session token on each request. For guests this costs nothing (no cookie is read when Supabase is not configured).
