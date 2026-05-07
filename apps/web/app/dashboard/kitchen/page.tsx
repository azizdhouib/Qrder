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

const FORWARD_LABEL: Record<OrderStatus, string> = {
  PLACED: "Demarrer",
  PREPARING: "Pret",
  READY: "Servi",
  SERVED: "",
  CANCELLED: ""
};

export default function KitchenPage() {
  return (
    <main className="container stack kitchen-focus">
      <section className="hero">
        <span className="badge">Kitchen Live</span>
        <h1 className="hero-title">Interface cuisine temps reel</h1>
        <p className="hero-subtitle">Suis et traite les commandes immediatement apres le scan client.</p>
      </section>
      <TokenGate>{(token) => <KitchenScreen token={token} />}</TokenGate>
    </main>
  );
}

function KitchenScreen({ token }: { token: string }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");

  async function load() {
    const data = await apiFetch<KitchenOrder[]>(
      "/kitchen/orders?includeRecentServed=true&recentMinutes=60",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setOrders(data);
  }

  useEffect(() => {
    load().catch(console.error);
    apiFetch<{ id: string }>("/me/restaurant", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setRestaurantId(r.id))
      .catch(console.error);
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
    socket.on("order.updated", (order: KitchenOrder) => {
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === order.id);
        if (exists) return prev.map((o) => (o.id === order.id ? order : o));
        return [...prev, order];
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [restaurantId]);

  const { active, served } = useMemo(() => {
    const a = orders.filter((o) => o.status !== "SERVED" && o.status !== "CANCELLED");
    const s = orders
      .filter((o) => o.status === "SERVED")
      .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
    return { active: a, served: s };
  }, [orders]);

  async function update(orderId: string, status: OrderStatus) {
    await apiFetch(`/kitchen/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
  }

  return (
    <div className="stack">
      <section>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            En cours ({active.length})
          </h2>
        </div>
        {active.length === 0 ? (
          <div className="panel">
            <p className="muted">Aucune commande en cours.</p>
          </div>
        ) : (
          <div className="grid grid-2 kitchen-grid">
            {active.map((order) => {
              const next = FORWARD[order.status];
              const prev = BACKWARD[order.status];
              return (
                <div key={order.id} className="panel kitchen-order-card">
                  <div className="row-between">
                    <h3 className="panel-title kitchen-order-title">
                      #{order.orderNumber} - Table {order.table.name}
                    </h3>
                    <span className={`status kitchen-order-status ${statusClass(order.status)}`}>
                      {labelOf(order.status)}
                    </span>
                  </div>
                  <div className="kitchen-order-items">
                    {order.items.map((item) => (
                      <p key={item.id} className="muted">
                        {item.quantity}x {item.nameSnapshot}
                      </p>
                    ))}
                  </div>
                  <div className="kitchen-order-actions">
                    <button
                      className="btn-secondary"
                      disabled={!prev}
                      onClick={() => prev && update(order.id, prev)}
                      title={prev ? `Revenir a ${labelOf(prev)}` : "Premiere etape"}
                    >
                      ← Reculer
                    </button>
                    {next && (
                      <button onClick={() => update(order.id, next)}>
                        {FORWARD_LABEL[order.status]} →
                      </button>
                    )}
                    {order.status !== "PLACED" && next === "SERVED" && (
                      <button className="btn-danger" onClick={() => update(order.id, "SERVED")}>
                        Servi
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {served.length > 0 && (
        <section>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Servies recemment ({served.length})
            </h2>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Tu peux annuler une erreur et renvoyer en cuisine
            </span>
          </div>
          <div className="grid grid-2 kitchen-grid">
            {served.map((order) => (
              <div key={order.id} className="panel kitchen-order-card kitchen-order-served">
                <div className="row-between">
                  <h3 className="panel-title kitchen-order-title">
                    #{order.orderNumber} - Table {order.table.name}
                  </h3>
                  <span className="status status-served">Servi</span>
                </div>
                <div className="kitchen-order-items">
                  {order.items.map((item) => (
                    <p key={item.id} className="muted">
                      {item.quantity}x {item.nameSnapshot}
                    </p>
                  ))}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn-secondary"
                    onClick={() => update(order.id, "READY")}
                    title="Annuler le servi - retour a Pret"
                  >
                    ↶ Annuler le servi
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => update(order.id, "PREPARING")}
                    title="Renvoyer en cuisine"
                  >
                    Renvoyer en cuisine
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
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
