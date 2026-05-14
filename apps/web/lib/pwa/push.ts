/**
 * Point d’extension pour les notifications push Web (VAPID, subscription, etc.).
 * Aucun enregistrement tant que le backend et les clés VAPID ne sont pas branchés.
 */

export type PushSupport = {
  supported: boolean;
  reason?: "no-sw" | "no-permission-api" | "denied" | "unconfigured";
};

export function isPushApiAvailable(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Prépare l’architecture ; retourne supported:false tant que l’intégration serveur n’existe pas. */
export async function preparePushSubscription(_registration: ServiceWorkerRegistration): Promise<PushSupport> {
  if (!isPushApiAvailable()) {
    return { supported: false, reason: "no-permission-api" };
  }
  return { supported: false, reason: "unconfigured" };
}
