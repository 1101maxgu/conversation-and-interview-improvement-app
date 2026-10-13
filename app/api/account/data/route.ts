// DELETE /api/account/data: "Delete all my data". Removes every saved session of the signed-in user.
import { NO_STORE, TABLE, requireUser, unavailable } from "@/lib/sessions";

export async function DELETE(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { error, count } = await auth.supabase.from(TABLE).delete({ count: "exact" }).eq("user_id", auth.userId);
  if (error) return unavailable("delete all", error);
  return Response.json({ deleted: count ?? 0 }, { headers: NO_STORE });
}
