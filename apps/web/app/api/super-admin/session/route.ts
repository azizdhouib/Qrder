import { NextResponse } from "next/server";
import { superAdminAuthGuard } from "@/lib/superAdminRouteAuth";

export async function GET(req: Request) {
  const denied = superAdminAuthGuard(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
