import { NextResponse } from "next/server";
import { getApiUrl, proxyHeadersFromSuperAdminRequest } from "@/lib/superAdminProxy";
import { superAdminAuthGuard, superAdminUnauthorizedResponse } from "@/lib/superAdminRouteAuth";

export async function GET(req: Request) {
  const denied = superAdminAuthGuard(req);
  if (denied) return denied;
  let headers: Record<string, string>;
  try {
    headers = proxyHeadersFromSuperAdminRequest(req);
  } catch {
    return superAdminUnauthorizedResponse();
  }
  const res = await fetch(`${getApiUrl()}/admin/directory`, {
    headers,
    cache: "no-store"
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" }
  });
}
