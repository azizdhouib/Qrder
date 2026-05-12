import { outboxAdd } from "./db";

/** File hors ligne : changement de statut cuisine. */
export async function enqueueKitchenStatusOffline(opts: {
  orderId: string;
  status: string;
  token: string;
}): Promise<string> {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await outboxAdd({
    id,
    type: "kitchen_status",
    createdAt: Date.now(),
    payload: opts
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qrder-outbox-changed"));
  }
  return id;
}
