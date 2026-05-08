import "./monorepoEnv";
import { NextResponse } from "next/server";
import { verifyPlatformAdminToken } from "./platformAdminToken";

export function superAdminUnauthorizedResponse(message = "Session super admin invalide.") {
  return NextResponse.json({ message }, { status: 401 });
}

export function getBearerFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization")?.trim();
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

/** Réponse 401 si échec, sinon `null`. Message explicite si l’appel n’a pas d’en-tête (ex. URL ouverte dans l’onglet). */
export function superAdminAuthGuard(req: Request): NextResponse | null {
  const token = getBearerFromRequest(req);
  if (!token) {
    return superAdminUnauthorizedResponse(
      "Authentification manquante : ouvre la page /super-admin et connecte-toi, ou envoie Authorization: Bearer <token>. Une URL tapée dans la barre d’adresse n’envoie pas le token."
    );
  }
  if (!verifyPlatformAdminToken(token)) {
    return superAdminUnauthorizedResponse("Token super admin invalide ou expiré — reconnecte-toi sur /super-admin/login.");
  }
  return null;
}

export function requireSuperAdminBearer(req: Request): boolean {
  const token = getBearerFromRequest(req);
  return Boolean(token && verifyPlatformAdminToken(token));
}
