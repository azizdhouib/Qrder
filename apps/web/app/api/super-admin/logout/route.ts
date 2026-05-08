import { NextResponse } from "next/server";

/** La session est dans sessionStorage côté client ; cette route sert de hook cohérent. */
export async function POST() {
  return NextResponse.json({ ok: true });
}
