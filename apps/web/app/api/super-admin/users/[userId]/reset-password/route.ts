import { NextResponse } from "next/server";
import { getApiUrl, proxyHeadersFromSuperAdminRequest } from "@/lib/superAdminProxy";
import { superAdminAuthGuard, superAdminUnauthorizedResponse } from "@/lib/superAdminRouteAuth";

type Ctx = { params: Promise<{ userId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = superAdminAuthGuard(req);
  if (denied) return denied;
  let headers: Record<string, string>;
  try {
    headers = proxyHeadersFromSuperAdminRequest(req);
  } catch {
    return superAdminUnauthorizedResponse();
  }
  const { userId } = await ctx.params;
  const res = await fetch(`${getApiUrl()}/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    headers,
    cache: "no-store"
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" }
  });
}
