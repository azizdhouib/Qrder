"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { apiFetch, API_URL } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type OrderStatus = "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";

type KitchenOrder = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  createdAt: string;
  /** Dernière maj (ex. passage en Servi) — pour tri et fenêtre 30 min côté API */
  updatedAt?: string;
  table: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

const FORWARD: Record<OrderStatus, OrderStatus | null> = {
  PLACED: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: null,
  CANCELLED: null
};

const BACKWARD: Record<OrderStatus, OrderStatus | null> = {
  PLACED: null,
  PREPARING: "PLACED",
  READY: "PREPARING",
  SERVED: "READY",
  CANCELLED: null
};

/** Colonnes du tableau (ordre affiché = flux cuisine, façon Jira). */
const KITCHEN_COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: "PLACED", title: "En attente" },
  { status: "PREPARING", title: "En preparation" },
  { status: "READY", title: "Pret" },
  { status: "SERVED", title: "Servi" }
];

/** Doit correspondre au paramètre recentMinutes de l’API cuisine (fenêtre colonne Servi). */
const KITCHEN_SERVED_VISIBLE_MINUTES = 30;

const KITCHEN_DISMISSED_SERVED_KEY = "qrder_kitchen_dismissed_served";

function readDismissedServedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(KITCHEN_DISMISSED_SERVED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function persistDismissedServedIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(KITCHEN_DISMISSED_SERVED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export default function KitchenPage() {
  return (
    <main className="container stack kitchen-focus">
      <section className="hero">
        <span className="badge">Cuisine</span>
        <h1 className="hero-title">Commandes en direct</h1>
        <p className="hero-subtitle">
          Fais avancer chaque commande d&apos;une étape à l&apos;autre selon où elle en est.
        </p>
      </section>
      <TokenGate>{(token) => <KitchenScreen token={token} />}</TokenGate>
    </main>
  );
}

function KitchenScreen({ token }: { token: string }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");
  const [dismissedServedIds, setDismissedServedIds] = useState<Set<string>>(() => new Set());

  function dismissServedFromBoard(orderId: string) {
    setDismissedServedIds((prev) => {
      if (prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.add(orderId);
      persistDismissedServedIds(next);
      return next;
    });
  }

  async function load() {
    const data = await apiFetch<KitchenOrder[]>(
      `/kitchen/orders?includeRecentServed=true&recentMinutes=${KITCHEN_SERVED_VISIBLE_MINUTES}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setOrders(data);
  }

  useEffect(() => {
    load().catch(console.error);
    apiFetch<{ id: string }>("/me/restaurant", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setRestaurantId(r.id))
      .catch(console.error);
    setDismissedServedIds(readDismissedServedIds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    const socket = io(API_URL);
    socket.emit("joinRestaurant", restaurantId);
    socket.on("order.created", (order: KitchenOrder) => {
      setOrders((prev) => {
        if (prev.some((o) => o.id === order.id)) return prev;
        return [...prev, order];
      });
    });
    socket.on("order.updated", (payload: Partial<KitchenOrder> & { id: string }) => {
      setOrders((prev) => {
        const existing = prev.find((o) => o.id === payload.id);
        const merged = mergeKitchenOrderFromSocket(existing, payload);
        if (!merged) return prev;
        const exists = prev.some((o) => o.id === merged.id);
        if (exists) return prev.map((o) => (o.id === merged.id ? merged : o));
        return [...prev, merged];
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [restaurantId]);

  useEffect(() => {
    setDismissedServedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        const o = orders.find((x) => x.id === id);
        if (!o || o.status !== "SERVED") {
          next.delete(id);
          changed = true;
        }
      }
      if (changed) persistDismissedServedIds(next);
      return changed ? next : prev;
    });
  }, [orders]);

  const ordersByStatus = useMemo(() => {
    const map: Record<OrderStatus, KitchenOrder[]> = {
      PLACED: [],
      PREPARING: [],
      READY: [],
      SERVED: [],
      CANCELLED: []
    };
    for (const o of orders) {
      if (o.status === "CANCELLED") continue;
      if (o.status === "SERVED" && dismissedServedIds.has(o.id)) continue;
      map[o.status].push(o);
    }
    const t = (s: string) => new Date(s).getTime();
    (Object.keys(map) as OrderStatus[]).forEach((key) => {
      if (key === "SERVED") {
        map[key].sort((a, b) => {
          const ta = a.updatedAt ? t(a.updatedAt) : t(a.createdAt);
          const tb = b.updatedAt ? t(b.updatedAt) : t(b.createdAt);
          return tb - ta;
        });
        return;
      }
      map[key].sort((a, b) => t(a.createdAt) - t(b.createdAt));
    });
    return map;
  }, [orders, dismissedServedIds]);

  const liveCount = useMemo(
    () =>
      ordersByStatus.PLACED.length +
      ordersByStatus.PREPARING.length +
      ordersByStatus.READY.length +
      ordersByStatus.SERVED.length,
    [ordersByStatus]
  );

  async function update(orderId: string, status: OrderStatus) {
    const updated = await apiFetch<KitchenOrder>(`/kitchen/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === orderId);
      if (idx === -1) return [...prev, updated];
      return prev.map((o) => (o.id === orderId ? updated : o));
    });
  }

  return (
    <div className="stack">
      <section>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Commandes ({liveCount})
          </h2>
        </div>
        <div className="kitchen-board" role="region" aria-label="Tableau des commandes par etape">
          {KITCHEN_COLUMNS.map((col) => {
            const columnOrders = ordersByStatus[col.status];
            return (
              <div key={col.status} className="kitchen-board-column">
                <header className="kitchen-board-column-header">
                  <h3
                    className="kitchen-board-column-title"
                    aria-label={`${col.title}, ${columnOrders.length} commande${columnOrders.length !== 1 ? "s" : ""}`}
                  >
                    <span className="kitchen-board-stage-name">{col.title}</span>
                    <span className="kitchen-board-count kitchen-board-count--inline">{columnOrders.length}</span>
                  </h3>
                </header>
                <div className={`kitchen-board-column-body kitchen-board-column-body--${col.status.toLowerCase()}`}>
                  {columnOrders.length === 0 ? (
                    <p className="kitchen-board-empty muted">Aucune commande</p>
                  ) : (
                    columnOrders.map((order) => (
                      <KitchenOrderKanbanCard
                        key={order.id}
                        order={order}
                        onMove={update}
                        onDismissFromBoard={dismissServedFromBoard}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function KitchenOrderKanbanCard({
  order,
  onMove,
  onDismissFromBoard
}: {
  order: KitchenOrder;
  onMove: (orderId: string, status: OrderStatus) => void;
  onDismissFromBoard: (orderId: string) => void;
}) {
  const next = FORWARD[order.status];
  const prev = BACKWARD[order.status];
  return (
    <article className={`panel kitchen-order-card kitchen-order-card--kanban${order.status === "SERVED" ? " kitchen-order-served" : ""}`}>
      <div className="kitchen-order-card-head">
        <h3 className="panel-title kitchen-order-title">
          #{order.orderNumber} — Table {order.table.name}
        </h3>
        <span className={`status kitchen-order-status ${statusClass(order.status)}`}>{labelOf(order.status)}</span>
      </div>
      <div className="kitchen-order-items">
        {order.items.map((item) => (
          <p key={item.id} className="muted">
            {item.quantity}x {item.nameSnapshot}
          </p>
        ))}
      </div>
      {order.status === "SERVED" && (
        <ServedAutoRemoveTimer
          updatedAt={order.updatedAt}
          createdAt={order.createdAt}
          windowMinutes={KITCHEN_SERVED_VISIBLE_MINUTES}
        />
      )}
      <div
        className={`kitchen-order-actions kitchen-order-actions--kanban${
          order.status === "SERVED" ? " kitchen-order-actions--served" : ""
        }`}
      >
        <button
          type="button"
          className="btn-secondary"
          disabled={!prev}
          onClick={() => prev && onMove(order.id, prev)}
          title={
            order.status === "SERVED"
              ? "Annuler le servi : retour a Pret"
              : prev
                ? `Etape precedente : ${labelOf(prev)}`
                : "Deja en premiere etape"
          }
          aria-label={prev ? `Reculer vers ${labelOf(prev)}` : "Impossible de reculer"}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && onMove(order.id, next)}
          title={next ? `Etape suivante : ${labelOf(next)}` : "Derniere etape"}
          aria-label={next ? `Avancer vers ${labelOf(next)}` : "Impossible d'avancer"}
        >
          <span aria-hidden="true">→</span>
        </button>
        {order.status === "SERVED" && (
          <>
            <button
              type="button"
              className="btn-secondary kitchen-served-renvoyer"
              onClick={() => onMove(order.id, "PREPARING")}
              title="Erreur de servi : remettre la commande en preparation"
              aria-label="Renvoyer en cuisine"
            >
              Renvoyer en cuisine
            </button>
            <button
              type="button"
              className="btn-secondary kitchen-served-dismiss"
              onClick={() => onDismissFromBoard(order.id)}
              title="Retire la commande de cet écran. Elle reste consultable dans l'historique."
              aria-label="Retirer du tableau"
            >
              Retirer du tableau
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function formatServedRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ServedAutoRemoveTimer({
  updatedAt,
  createdAt,
  windowMinutes
}: {
  updatedAt?: string;
  createdAt: string;
  windowMinutes: number;
}) {
  const endMs = useMemo(() => {
    const anchor = updatedAt ?? createdAt;
    return new Date(anchor).getTime() + windowMinutes * 60 * 1000;
  }, [updatedAt, createdAt, windowMinutes]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = endMs - now;
  const timeStr = formatServedRemaining(remaining);
  const urgent = remaining > 0 && remaining <= 60_000;
  const ariaLabel = servedExpiryAriaLabel(remaining);

  return (
    <p
      className={`kitchen-served-expiry muted${urgent ? " kitchen-served-expiry--urgent" : ""}`}
      role="timer"
      aria-label={ariaLabel}
    >
      <span className="kitchen-served-expiry-label">Disparition auto dans </span>
      <span className="kitchen-served-expiry-time">{remaining <= 0 ? "0:00" : timeStr}</span>
    </p>
  );
}

function servedExpiryAriaLabel(remaining: number): string {
  if (remaining <= 0) return "Bientôt retirée de l'écran";
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `Disparition automatique dans ${s} seconde${s > 1 ? "s" : ""}`;
  if (s === 0) return `Disparition automatique dans ${m} minute${m > 1 ? "s" : ""}`;
  return `Disparition automatique dans ${m} minute${m > 1 ? "s" : ""} et ${s} seconde${s > 1 ? "s" : ""}`;
}

function mergeKitchenOrderFromSocket(
  existing: KitchenOrder | undefined,
  payload: Partial<KitchenOrder> & { id: string }
): KitchenOrder | null {
  if (!existing) {
    const complete =
      payload.orderNumber != null &&
      payload.status &&
      payload.createdAt &&
      payload.table &&
      Array.isArray(payload.items);
    return complete ? (payload as KitchenOrder) : null;
  }
  return {
    ...existing,
    ...payload,
    table: payload.table ?? existing.table,
    items: payload.items ?? existing.items,
    updatedAt: payload.updatedAt ?? existing.updatedAt
  };
}

function labelOf(status: OrderStatus): string {
  if (status === "PLACED") return "En attente";
  if (status === "PREPARING") return "En preparation";
  if (status === "READY") return "Pret";
  if (status === "SERVED") return "Servi";
  return "Annule";
}

function statusClass(status: OrderStatus) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  return "status-served";
}
