/** Détection réseau navigateur + ping léger optionnel. */

export function readNavigatorOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function isLikelyNetworkFailure(err: unknown): boolean {
  if (!readNavigatorOnline()) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /network|failed to fetch|load failed|internet|offline/i.test(msg) ||
    err instanceof TypeError
  );
}
