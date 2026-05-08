import "./monorepoEnv";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getApiUrl() {
  return API_URL;
}

/** Réutilise le Bearer reçu par la route Next pour appeler l’API Express. */
export function proxyHeadersFromSuperAdminRequest(req: Request): Record<string, string> {
  const auth = req.headers.get("authorization")?.trim();
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw new Error("Authorization Bearer requis.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: auth
  };
}
