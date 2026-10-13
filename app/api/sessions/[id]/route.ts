// One saved session: open it (GET) or delete it (DELETE). Signed-in owner only.
// "Not found" and "not yours" are the same 404, so the route never reveals whether an id exists.
import { isUuid, jsonError } from "@/lib/guard";
import { FULL_COLUMNS, NO_STORE, TABLE, requireUser, toSavedSession, unavailable } from "@/lib/sessions";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => jsonError(404, "We couldn't find that session.");

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data, error } = await auth.supabase.from(TABLE).select(FULL_COLUMNS).eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (error) return unavailable("open", error);
  if (!data) return notFound();
  return Response.json(toSavedSession(data), { headers: NO_STORE });
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data, error } = await auth.supabase.from(TABLE).delete().eq("id", id).eq("user_id", auth.userId).select("id");
  if (error) return unavailable("delete", error);
  if (!data?.length) return notFound();
  return Response.json({ deleted: 1 }, { headers: NO_STORE });
}
