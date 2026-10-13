import { publicCompanions } from "../../../lib/companions";

// Static data and no request access, so with cacheComponents this is prerendered at build time.
// (Next 16 with cacheComponents rejects the old `dynamic`/`revalidate` segment exports.)
export function GET() {
  return Response.json(publicCompanions(), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
