export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Erreur HTTP typée (ex. 401) — à distinguer des coupures réseau. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiRequestError(text || "Request failed", res.status, text);
  }
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
