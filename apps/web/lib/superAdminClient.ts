import { SUPER_ADMIN_TOKEN_KEY } from "./superAdminConstants";

export function getSuperAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SUPER_ADMIN_TOKEN_KEY);
}

export function setSuperAdminToken(token: string) {
  sessionStorage.setItem(SUPER_ADMIN_TOKEN_KEY, token);
}

export function clearSuperAdminToken() {
  sessionStorage.removeItem(SUPER_ADMIN_TOKEN_KEY);
}

/** Fusionne Authorization: Bearer avec les en-têtes fournis (appels fetch client → /api/super-admin/*). */
export function superAdminFetchInit(init: RequestInit = {}): RequestInit {
  const token = getSuperAdminToken();
  const headers = new Headers(init.headers ?? undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}
