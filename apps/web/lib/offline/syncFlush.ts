import { API_URL } from "@/lib/api";
import { metaSet, outboxAll, outboxDelete, outboxUpdate, type OutboxRecord } from "./db";

const MAX_ATTEMPTS = 12;

function backoffMs(attempts: number): number {
  const base = 800;
  const cap = 60_000;
  return Math.min(cap, base * 2 ** Math.min(attempts, 8));
}

async function flushKitchenStatus(row: OutboxRecord): Promise<void> {
  const p = row.payload as { orderId: string; status: string; token: string };
  const res = await fetch(`${API_URL}/kitchen/orders/${encodeURIComponent(p.orderId)}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.token}`
    },
    body: JSON.stringify({ status: p.status }),
    cache: "no-store"
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
}

/** Envoie la file d’attente (ordre FIFO, retry exponentiel). */
export async function flushOfflineOutbox(): Promise<{ processed: number; failed: number }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;
  const rows = (await outboxAll()).sort((a, b) => a.createdAt - b.createdAt);
  const now = Date.now();

  for (const row of rows) {
    if (row.nextAttemptAt > now) continue;

    try {
      await flushKitchenStatus(row);
      await outboxDelete(row.id);
      processed++;
    } catch {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await outboxDelete(row.id);
        failed++;
        await metaSet(`outbox_failed_${row.id}`, { row, at: Date.now() }).catch(() => {});
        continue;
      }
      await outboxUpdate({
        ...row,
        attempts,
        nextAttemptAt: Date.now() + backoffMs(attempts)
      });
      failed++;
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qrder-outbox-changed"));
  }

  return { processed, failed };
}
