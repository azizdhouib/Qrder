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
  updatedAt?: string;
  /** ISO — défini par l’API au passage en PREPARING. */
  preparingStartedAt: string | null;
  notes: string | null;
  table: { name: string };
  items: {
    id: string;
    nameSnapshot: string;
    quantity: number;
    options: { id: string; nameSnapshot: string }[];
  }[];
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

const KITCHEN_COLUMNS: {
  status: OrderStatus;
  title: string;
  hint: string;
}[] = [
  { status: "PLACED", title: "Nouvelles", hint: "À démarrer" },
  { status: "PREPARING", title: "En préparation", hint: "En cours" },
  { status: "READY", title: "Prêtes", hint: "À servir" },
  { status: "SERVED", title: "Servies", hint: "File de fin" }
];

const KITCHEN_SERVED_VISIBLE_MINUTES = 30;
const KITCHEN_DISMISSED_SERVED_KEY = "qrder_kitchen_dismissed_served";

/** Seuils d’affichage « attente » (minutes depuis la prise de commande). */
const WAIT_ATTENTION_MIN = 12;
const WAIT_URGENT_MIN = 25;

function useIntervalNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function serviceBandLabel(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "Service du matin";
  if (h >= 11 && h < 15) return "Service du midi";
  if (h >= 15 && h < 19) return "Entre les services";
  return "Service du soir";
}

function formatOrderTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function minutesSince(createdAt: string, nowMs: number) {
  return Math.floor((nowMs - new Date(createdAt).getTime()) / 60_000);
}

/** Temps écoulé depuis la commande : format compact une ligne (ex. 8:03 puis 1:08:05) pour petits écrans / colonnes étroites. */
function formatDepuisLabel(createdAt: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - new Date(createdAt).getTime());
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDepuisTitle(createdAt: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - new Date(createdAt).getTime());
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `Temps écoulé : ${h} h ${m} min ${s} s`;
  if (m > 0) return `Temps écoulé : ${m} min ${s} s`;
  return `Temps écoulé : ${s} s`;
}

function waitClass(minutes: number): "ok" | "attention" | "urgent" {
  if (minutes >= WAIT_URGENT_MIN) return "urgent";
  if (minutes >= WAIT_ATTENTION_MIN) return "attention";
  return "ok";
}

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
    <main className="kds-page">
      <TokenGate>{(token) => <KitchenKdsScreen token={token} />}</TokenGate>
    </main>
  );
}

function KitchenKdsScreen({ token }: { token: string }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");
  const [dismissedServedIds, setDismissedServedIds] = useState<Set<string>>(() => new Set());
  const waitNow = useIntervalNow(1000);

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
    setOrders(
      data.map((o) => ({
        ...o,
        preparingStartedAt: o.preparingStartedAt ?? null,
        notes: o.notes ?? null,
        items: (o.items ?? []).map((it) => ({
          ...it,
          options: Array.isArray(it.options) ? it.options : []
        }))
      }))
    );
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
      const normalized: KitchenOrder = {
        ...order,
        preparingStartedAt: order.preparingStartedAt ?? null,
        notes: order.notes ?? null,
        items: (order.items ?? []).map((it) => ({
          ...it,
          options: Array.isArray(it.options) ? it.options : []
        }))
      };
      setOrders((prev) => {
        if (prev.some((o) => o.id === normalized.id)) return prev;
        return [...prev, normalized];
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
    const normalized: KitchenOrder = {
      ...updated,
      preparingStartedAt: updated.preparingStartedAt ?? null,
      notes: updated.notes ?? null,
      items: (updated.items ?? []).map((it) => ({
        ...it,
        options: Array.isArray(it.options) ? it.options : []
      }))
    };
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === orderId);
      if (idx === -1) return [...prev, normalized];
      return prev.map((o) => (o.id === orderId ? normalized : o));
    });
  }

  const band = serviceBandLabel();

  return (
    <div className="kds-stack">
      <header className="kds-header">
        <div className="kds-header-text">
          <p className="kds-service-band">{band}</p>
          <h1 className="kds-title">Écran cuisine (KDS)</h1>
        </div>
        <div className="kds-header-side">
          <div className="kds-live-pill">
            <span className="kds-live-dot" aria-hidden="true" />
            <span>En direct</span>
            <span className="kds-live-sep">·</span>
            <strong className="kds-live-count">{liveCount}</strong>
            <span> commande{liveCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </header>

      <section className="kds-board-wrap" aria-label="Commandes par étape">
        <div className="kitchen-board kds-board" role="region">
          {KITCHEN_COLUMNS.map((col) => {
            const columnOrders = ordersByStatus[col.status];
            return (
              <div key={col.status} className="kitchen-board-column kds-column">
                <header className="kitchen-board-column-header kds-column-head">
                  <h2
                    className="kitchen-board-column-title kds-column-title"
                    aria-label={`${col.title}, ${columnOrders.length} ticket${columnOrders.length !== 1 ? "s" : ""}`}
                  >
                    <span className="kds-column-title-row">
                      <span className="kitchen-board-stage-name">{col.title}</span>
                      <span className="kitchen-board-count kitchen-board-count--inline">{columnOrders.length}</span>
                    </span>
                    <span className="kds-column-hint muted">{col.hint}</span>
                  </h2>
                </header>
                <div className={`kitchen-board-column-body kitchen-board-column-body--${col.status.toLowerCase()} kds-column-body`}>
                  {columnOrders.length === 0 ? (
                    <p className="kitchen-board-empty muted kds-empty">Aucune commande</p>
                  ) : (
                    columnOrders.map((order) => (
                      <KdsTicketCard
                        key={order.id}
                        order={order}
                        waitNow={waitNow}
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

function KdsTicketCard({
  order,
  waitNow,
  onMove,
  onDismissFromBoard
}: {
  order: KitchenOrder;
  waitNow: number;
  onMove: (orderId: string, status: OrderStatus) => void;
  onDismissFromBoard: (orderId: string) => void;
}) {
  const itemIdsKey = order.items.map((i) => i.id).join(",");
  const [doneLineIds, setDoneLineIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDoneLineIds(new Set());
  }, [itemIdsKey]);

  useEffect(() => {
    if (order.status !== "PREPARING") setDoneLineIds(new Set());
  }, [order.status]);

  function toggleLineItem(itemId: string) {
    if (order.status !== "PREPARING") return;
    setDoneLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const next = FORWARD[order.status];
  const prev = BACKWARD[order.status];
  const waitMin = minutesSince(order.createdAt, waitNow);
  const wClass = waitClass(waitMin);
  const linePickMode = order.status === "PREPARING";
  const elapsedMs = Math.max(0, waitNow - new Date(order.createdAt).getTime());
  const depuisLong = elapsedMs >= 10 * 60 * 1000;

  return (
    <article
      className={`kds-ticket panel kitchen-order-card kitchen-order-card--kanban kds-ticket--wait-${wClass}${
        depuisLong ? " kds-ticket--prep-long" : ""
      }${order.status === "SERVED" ? " kitchen-order-served" : ""}`}
    >
      <div className="kds-ticket-top">
        <div className="kds-ticket-id-block">
          <span className="kds-ticket-number" aria-label={`Commande numéro ${order.orderNumber}`}>
            #{order.orderNumber}
          </span>
          <span className="kds-ticket-table">Table {order.table.name}</span>
        </div>
        <span className={`status kitchen-order-status ${statusClass(order.status)}`}>{labelOf(order.status)}</span>
      </div>

      <div className={`kds-ticket-times kds-ticket-times--${wClass}`}>
        <div className="kds-time-row">
          <span className="kds-time-label">Commande</span>
          <span className="kds-time-value">{formatOrderTime(order.createdAt)}</span>
        </div>
        <div
          className={`kds-time-row kds-time-row--emph kds-time-row--depuis${depuisLong ? " kds-time-row--prep-long" : ""}`}
        >
          <span className="kds-time-label">Depuis</span>
          <span
            className="kds-time-value kds-depuis-value"
            title={formatDepuisTitle(order.createdAt, waitNow)}
          >
            {formatDepuisLabel(order.createdAt, waitNow)}
          </span>
        </div>
      </div>

      {order.notes?.trim() ? (
        <div className="kds-ticket-notes">
          <span className="kds-notes-label">Note client</span>
          <p className="kds-notes-body">{order.notes.trim()}</p>
        </div>
      ) : null}

      <ul className="kds-lines">
        {order.items.map((item) => {
          const lineDone = linePickMode && doneLineIds.has(item.id);
          const lineLabel = `${item.quantity}× ${item.nameSnapshot}`;
          const inner = (
            <>
              <div className="kds-line-main">
                <span className="kds-line-qty">{item.quantity}×</span>
                <span className="kds-line-name">{item.nameSnapshot}</span>
              </div>
              {item.options.length > 0 ? (
                <ul className="kds-line-options">
                  {item.options.map((opt) => (
                    <li key={opt.id}>+ {opt.nameSnapshot}</li>
                  ))}
                </ul>
              ) : null}
            </>
          );
          return (
            <li key={item.id} className="kds-line-wrap">
              {linePickMode ? (
                <button
                  type="button"
                  className={`kds-line${lineDone ? " kds-line--done" : ""}`}
                  onClick={() => toggleLineItem(item.id)}
                  aria-pressed={lineDone}
                  aria-label={lineDone ? `Annuler ${lineLabel}` : `Valider ${lineLabel}`}
                >
                  {inner}
                </button>
              ) : (
                <div className="kds-line-static">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      {order.status === "SERVED" && (
        <ServedAutoRemoveTimer
          updatedAt={order.updatedAt}
          createdAt={order.createdAt}
          windowMinutes={KITCHEN_SERVED_VISIBLE_MINUTES}
        />
      )}

      <div
        className={`kitchen-order-actions kitchen-order-actions--kanban kds-ticket-actions${
          order.status === "SERVED" ? " kitchen-order-actions--served" : ""
        }`}
      >
        <button
          type="button"
          className="btn-secondary kds-btn-step"
          disabled={!prev}
          onClick={() => prev && onMove(order.id, prev)}
          title={
            order.status === "SERVED"
              ? "Annuler le servi : retour à Prêtes"
              : prev
                ? `Étape précédente : ${labelOf(prev)}`
                : "Déjà en première étape"
          }
          aria-label={prev ? `Reculer vers ${labelOf(prev)}` : "Impossible de reculer"}
        >
          <span aria-hidden="true">←</span> Préc.
        </button>
        <button
          type="button"
          className="kds-btn-step kds-btn-step-primary"
          disabled={!next}
          onClick={() => next && onMove(order.id, next)}
          title={next ? `Étape suivante : ${labelOf(next)}` : "Dernière étape"}
          aria-label={next ? `Avancer vers ${labelOf(next)}` : "Terminé"}
        >
          Suiv. <span aria-hidden="true">→</span>
        </button>
        {order.status === "SERVED" && (
          <>
            <button
              type="button"
              className="btn-secondary kitchen-served-renvoyer kds-btn-full"
              onClick={() => onMove(order.id, "PREPARING")}
              title="Erreur de servi : remettre en préparation"
              aria-label="Renvoyer en cuisine"
            >
              Renvoyer en cuisine
            </button>
            <button
              type="button"
              className="btn-secondary kitchen-served-dismiss kds-btn-full"
              onClick={() => onDismissFromBoard(order.id)}
              title="Retire le ticket de cet écran. Consultable dans Historique."
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
      className={`kitchen-served-expiry muted kds-served-timer${urgent ? " kitchen-served-expiry--urgent" : ""}`}
      role="timer"
      aria-label={ariaLabel}
    >
      <span className="kitchen-served-expiry-label">Masquage auto dans </span>
      <span className="kitchen-served-expiry-time">{remaining <= 0 ? "0:00" : timeStr}</span>
    </p>
  );
}

function servedExpiryAriaLabel(remaining: number): string {
  if (remaining <= 0) return "Bientôt retirée de l'écran";
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `Masquage automatique dans ${s} seconde${s > 1 ? "s" : ""}`;
  if (s === 0) return `Masquage automatique dans ${m} minute${m > 1 ? "s" : ""}`;
  return `Masquage automatique dans ${m} minute${m > 1 ? "s" : ""} et ${s} seconde${s > 1 ? "s" : ""}`;
}

function mergeKitchenOrderFromSocket(
  existing: KitchenOrder | undefined,
  payload: Partial<KitchenOrder> & { id: string }
): KitchenOrder | null {
  const items = payload.items
    ? payload.items.map((it) => ({
        ...it,
        options: Array.isArray(it.options) ? it.options : []
      }))
    : undefined;

  if (!existing) {
    const complete =
      payload.orderNumber != null &&
      payload.status &&
      payload.createdAt &&
      payload.table &&
      Array.isArray(payload.items);
    if (!complete) return null;
    const p = payload as KitchenOrder;
    return {
      ...p,
      preparingStartedAt: p.preparingStartedAt ?? null,
      notes: p.notes ?? null,
      items: (p.items ?? []).map((it) => ({
        ...it,
        options: Array.isArray(it.options) ? it.options : []
      }))
    };
  }
  return {
    ...existing,
    ...payload,
    notes: payload.notes !== undefined ? payload.notes : existing.notes,
    preparingStartedAt:
      payload.preparingStartedAt !== undefined
        ? payload.preparingStartedAt
        : existing.preparingStartedAt,
    table: payload.table ?? existing.table,
    items: items ?? existing.items,
    updatedAt: payload.updatedAt ?? existing.updatedAt
  };
}

function labelOf(status: OrderStatus): string {
  if (status === "PLACED") return "Nouvelle";
  if (status === "PREPARING") return "En préparation";
  if (status === "READY") return "Prête";
  if (status === "SERVED") return "Servie";
  return "Annulée";
}

function statusClass(status: OrderStatus) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  return "status-served";
}
