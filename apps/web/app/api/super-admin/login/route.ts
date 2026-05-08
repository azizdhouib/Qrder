import { NextResponse } from "next/server";
import { getApiUrl } from "@/lib/superAdminProxy";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ message: "Corps JSON invalide." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ message: "Email et mot de passe requis." }, { status: 400 });
  }

  const apiRes = await fetch(`${getApiUrl()}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });

  const data = (await apiRes.json()) as { token?: string; message?: string };
  if (!apiRes.ok) {
    return NextResponse.json(
      { message: data.message ?? "Connexion refusée." },
      { status: apiRes.status === 401 ? 401 : 502 }
    );
  }

  if (!data.token) {
    return NextResponse.json({ message: "Réponse API invalide." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, token: data.token });
}
