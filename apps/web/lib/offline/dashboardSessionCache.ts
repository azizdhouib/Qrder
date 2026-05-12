import { metaDelete, metaGet, metaSet } from "./db";

export const DASH_SESSION_META_KEY = "qrder_dashboard_session_v1";

export type CachedDashboardSession = {
  userId: string;
  role: "OWNER" | "MANAGER" | "KITCHEN";
  restaurantName: string;
};

export async function loadCachedDashboardSession(): Promise<CachedDashboardSession | null> {
  const v = await metaGet<CachedDashboardSession>(DASH_SESSION_META_KEY);
  return v ?? null;
}

export async function saveCachedDashboardSession(s: CachedDashboardSession): Promise<void> {
  await metaSet(DASH_SESSION_META_KEY, s);
}

export async function clearCachedDashboardSession(): Promise<void> {
  await metaDelete(DASH_SESSION_META_KEY);
}
