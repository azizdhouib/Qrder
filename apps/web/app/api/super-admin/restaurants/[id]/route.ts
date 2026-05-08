import { NextResponse } from "next/server";
import { getApiUrl, proxyHeadersFromSuperAdminRequest } from "@/lib/superAdminProxy";
import { superAdminAuthGuard, superAdminUnauthorizedResponse } from "@/lib/superAdminRouteAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = superAdminAuthGuard(req);
  if (denied) return denied;
  let headers: Record<string, string>;
  try {
    headers = proxyHeadersFromSuperAdminRequest(req);
  } catch {
    return superAdminUnauthorizedResponse();
  }
  const { id } = await ctx.params;
  const body = await req.text();
  const res = await fetch(`${getApiUrl()}/admin/restaurants/${id}`, {
    method: "PATCH",
    headers,
    body,
    cache: "no-store"
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" }
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = superAdminAuthGuard(req);
  if (denied) return denied;
  let headers: Record<string, string>;
  try {
    headers = proxyHeadersFromSuperAdminRequest(req);
  } catch {
    return superAdminUnauthorizedResponse();
  }
  const { id } = await ctx.params;
  const res = await fetch(`${getApiUrl()}/admin/restaurants/${id}`, {
    method: "DELETE",
    headers,
    cache: "no-store"
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" }
  });
}
