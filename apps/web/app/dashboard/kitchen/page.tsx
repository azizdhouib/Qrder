"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { apiFetch, API_URL } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type KitchenOrder = {
  id: string;
  orderNumber: number;
  status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  table: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number }[];
};

export default function KitchenPage() {
  return (
    <main className="container stack kitchen-focus">
      <section className="hero">
        <span className="badge">Kitchen Live</span>
        <h1 className="hero-title">Interface cuisine temps réel</h1>
        <p className="hero-subtitle">Suis et traite les commandes immédiatement après le scan client.</p>
      </section>
      <TokenGate>{(token) => <KitchenScreen token={token} />}</TokenGate>
    </main>
  );
}

function KitchenScreen({ token }: { token: string }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");

  async function load() {
    const data = await apiFetch<KitchenOrder[]>("/kitchen/orders", {
      headers: { Authorization: `Bearer ${token}` }
    });
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
      setOrders((prev) => [...prev, order]);
    });
    socket.on("order.updated", (order: KitchenOrder) => {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)).filter((o) => o.status !== "SERVED"));
    });
    return () => {
      socket.disconnect();
    };
  }, [restaurantId]);

  return (
    <div className="grid grid-2 kitchen-grid">
      {orders.map((order) => (
        <div key={order.id} className="panel kitchen-order-card">
          <div className="row-between">
            <h3 className="panel-title kitchen-order-title">
              #{order.orderNumber} - Table {order.table.name}
            </h3>
            <span className={`status kitchen-order-status ${statusClass(order.status)}`}>{order.status}</span>
          </div>
          <div className="kitchen-order-items">
            {order.items.map((item) => (
              <p key={item.id} className="muted">
                {item.quantity}x {item.nameSnapshot}
              </p>
            ))}
          </div>
          <div className="kitchen-order-actions">
            <button className="btn-secondary" onClick={() => updateStatus(order.id, "PREPARING", token)}>
              En préparation
            </button>
            <button onClick={() => updateStatus(order.id, "READY", token)}>Prêt</button>
            <button className="btn-danger" onClick={() => updateStatus(order.id, "SERVED", token)}>
              Servi
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function statusClass(status: KitchenOrder["status"]) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  return "status-served";
}

async function updateStatus(orderId: string, status: string, token: string) {
  await apiFetch(`/kitchen/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
}
