"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type HistoryOrder = {
  id: string;
  orderNumber: number;
  status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  totalCents: number;
  createdAt: string;
  table: { name: string };
  items: { id: string; nameSnapshot: string; quantity: number; lineTotalCents: number }[];
};

const STATUS_FR: Record<HistoryOrder["status"], string> = {
  PLACED: "En attente",
  PREPARING: "En préparation",
  READY: "Prêt",
  SERVED: "Servi",
  CANCELLED: "Annulé"
};

export default function HistoryPage() {
  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Historique</span>
        <h1 className="hero-title">Historique des commandes</h1>
        <p className="hero-subtitle">Retrouve toutes les commandes passées du restaurant.</p>
      </section>
      <TokenGate>{(token) => <HistoryList token={token} />}</TokenGate>
    </main>
  );
}

function HistoryList({ token }: { token: string }) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [status, setStatus] = useState<"" | HistoryOrder["status"]>("");

  async function load() {
    const qs = status ? `?status=${status}` : "";
    const data = await apiFetch<HistoryOrder[]>(`/orders/history${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setOrders(data);
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const totalRevenue = useMemo(
    () =>
      orders
        .filter((o) => o.status !== "CANCELLED")
        .reduce((acc, order) => acc + order.totalCents, 0),
    [orders]
  );

  return (
    <div className="stack">
      <div className="panel row-between">
        <div className="row" style={{ flex: 1 }}>
          <select
            value={status}
            onChange={(e) => setStatus((e.target.value as HistoryOrder["status"]) || "")}
            style={{ maxWidth: 220 }}
          >
            <option value="">Tous les statuts</option>
            <option value="PLACED">{STATUS_FR.PLACED}</option>
            <option value="PREPARING">{STATUS_FR.PREPARING}</option>
            <option value="READY">{STATUS_FR.READY}</option>
            <option value="SERVED">{STATUS_FR.SERVED}</option>
            <option value="CANCELLED">{STATUS_FR.CANCELLED}</option>
          </select>
          <button className="btn-secondary" onClick={() => load()}>
            Rafraîchir
          </button>
        </div>
        <span className="pill">CA : {(totalRevenue / 100).toFixed(2)} €</span>
      </div>

      {orders.length > 0 && (
        <div className="history-orders">
          {orders.map((order) => (
            <article key={order.id} className="panel history-order-card">
              <div className="history-order-head row-between">
                <h3 className="panel-title history-order-title">
                  #{order.orderNumber} — Table {order.table.name}
                </h3>
                <span className={`status ${statusClass(order.status)}`}>{STATUS_FR[order.status]}</span>
              </div>
              <p className="muted history-order-meta">
                {new Date(order.createdAt).toLocaleString("fr-FR")} — Total {(order.totalCents / 100).toFixed(2)} €
              </p>
              {order.items.length > 0 ? (
                <ul className="history-order-lines">
                  {order.items.map((item) => (
                    <li key={item.id} className="muted history-order-line">
                      <span>
                        {item.quantity}× {item.nameSnapshot}
                      </span>
                      <span className="tabular-nums">{(item.lineTotalCents / 100).toFixed(2)} €</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {orders.length === 0 && <div className="panel muted">Aucune commande trouvée pour ce filtre.</div>}
    </div>
  );
}

function statusClass(status: HistoryOrder["status"]) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  if (status === "CANCELLED") return "status-cancelled";
  return "status-served";
}
