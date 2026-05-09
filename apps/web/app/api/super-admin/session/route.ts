import { NextResponse } from "next/server";
import { superAdminAuthGuard } from "@/lib/superAdminRouteAuth";
import { getApiUrl, proxyHeadersFromSuperAdminRequest } from "@/lib/superAdminProxy";

export async function GET(req: Request) {
  const denied = superAdminAuthGuard(req);
  if (denied) return denied;
  // Vérifie réellement le token auprès de l'API admin.
  // On réutilise l'endpoint directory comme ping d'auth.
  let headers: Record<string, string>;
  try {
    headers = proxyHeadersFromSuperAdminRequest(req);
  } catch {
    return NextResponse.json({ message: "Session super admin invalide." }, { status: 401 });
  }

  const res = await fetch(`${getApiUrl()}/admin/directory`, {
    headers,
    cache: "no-store"
  });
  if (!res.ok) {
    return NextResponse.json({ message: "Session super admin invalide." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
