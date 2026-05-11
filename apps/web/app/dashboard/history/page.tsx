"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type HistoryOrder = {
  id: string;
  orderNumber: number;
  status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  totalCents: number;
  createdAt: string;
  billId?: string | null;
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

function formatRelativeHistory(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "à l’instant";
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return "à l’instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatEurCompact(cents: number): string {
  const euros = cents / 100;
  if (Number.isInteger(euros)) return `${euros}€`;
  return `${euros.toFixed(2).replace(".", ",")}€`;
}

export default function HistoryPage() {
  return (
    <main className="history-billing-page">
      <TokenGate>{(token) => <HistoryBilling token={token} />}</TokenGate>
    </main>
  );
}

function HistoryBilling({ token }: { token: string }) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [status, setStatus] = useState<"" | HistoryOrder["status"]>("");
  const [query, setQuery] = useState("");
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    apiFetch<{ role: string }>("/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setStaff(r.role === "OWNER" || r.role === "MANAGER"))
      .catch(() => setStaff(false));
  }, [token]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const table = o.table.name.toLowerCase();
      const num = String(o.orderNumber);
      const items = o.items.some((i) => i.nameSnapshot.toLowerCase().includes(q));
      return table.includes(q) || num.includes(q) || items;
    });
  }, [orders, query]);

  const totalRevenue = useMemo(
    () =>
      orders.filter((o) => o.status !== "CANCELLED").reduce((acc, order) => acc + order.totalCents, 0),
    [orders]
  );

  function placeholderFeature(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    /* PDF / e-mail : prochaine itération */
  }

  return (
    <div className="history-billing-stack">
      <header className="history-billing-header">
        <p className="history-billing-kicker">Historique</p>
        <h1 className="history-billing-title">Notes &amp; encaissements</h1>
        <p className="history-billing-lead muted">
          Encaissement et factures :{" "}
          <Link href="/dashboard/caisse" className="link-inline">
            Caisse
          </Link>
          . CA commandes (hors annulées) sur l&apos;historique chargé :{" "}
          <strong className="history-billing-ca">{formatEurCompact(totalRevenue)}</strong>
        </p>
      </header>

      <div className="history-billing-search-wrap">
        <span className="history-billing-search-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.2-4.2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          className="history-billing-search"
          placeholder="Rechercher par table, n° commande, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="history-billing-toolbar">
        <label className="history-billing-filter-label muted">
          Statut
          <select
            className="history-billing-filter"
            value={status}
            onChange={(e) => setStatus((e.target.value as HistoryOrder["status"]) || "")}
          >
            <option value="">Tous</option>
            <option value="PLACED">{STATUS_FR.PLACED}</option>
            <option value="PREPARING">{STATUS_FR.PREPARING}</option>
            <option value="READY">{STATUS_FR.READY}</option>
            <option value="SERVED">{STATUS_FR.SERVED}</option>
            <option value="CANCELLED">{STATUS_FR.CANCELLED}</option>
          </select>
        </label>
        <button type="button" className="btn-secondary history-billing-refresh" onClick={() => load()}>
          Rafraîchir
        </button>
      </div>

      {filtered.length > 0 ? (
        <div className="history-billing-list">
          {filtered.map((order) => (
            <article key={order.id} className="history-bill-card">
              <div className="history-bill-top">
                <div className="history-bill-id-block">
                  <div className="history-bill-id-row">
                    <span className="history-bill-table-order">
                      {order.table.name} - #{order.orderNumber}
                    </span>
                    <span className="history-bill-note-tag muted">Note {order.orderNumber}</span>
                  </div>
                </div>
                <div className="history-bill-total">{formatEurCompact(order.totalCents)}</div>
              </div>
              <p className="history-bill-meta muted">
                {formatRelativeHistory(order.createdAt)} — {order.items.length} article
                {order.items.length !== 1 ? "s" : ""} — {STATUS_FR[order.status].toLowerCase()}
                {order.status === "SERVED" && order.billId
                  ? " — encaissée"
                  : order.status === "SERVED"
                    ? " — à encaisser (caisse)"
                    : ""}
                {staff && order.billId ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link href={`/dashboard/caisse/facture/${order.billId}`} className="link-inline">
                      Voir la facture
                    </Link>
                  </>
                ) : null}
              </p>
              {order.items.length > 0 ? (
                <ul className="history-bill-lines">
                  {order.items.map((item) => (
                    <li key={item.id} className="history-bill-line">
                      <span className="history-bill-line-name">
                        {item.quantity}× {item.nameSnapshot}
                      </span>
                      <span className="history-bill-line-price tabular-nums">
                        {formatEurCompact(item.lineTotalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="history-bill-actions">
                <input
                  type="email"
                  className="history-bill-email"
                  placeholder="email@client.com"
                  title="L’envoi par e-mail sera disponible prochainement"
                  autoComplete="off"
                  aria-label="E-mail client"
                />
                <button
                  type="button"
                  className="history-bill-btn history-bill-btn--outline"
                  title="Bientôt disponible"
                  onClick={placeholderFeature}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M4 6h16v12H4z" strokeLinejoin="round" />
                    <path d="M22 6l-8.5 6a2 2 0 0 1-2.2 0L2 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Envoyer
                </button>
                <button
                  type="button"
                  className="history-bill-btn history-bill-btn--solid"
                  title="Bientôt disponible"
                  onClick={placeholderFeature}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M12 3v11" strokeLinecap="round" />
                    <path d="M8 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 21h16" strokeLinecap="round" />
                  </svg>
                  Note PDF
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="history-billing-empty panel muted">
          {orders.length === 0
            ? "Aucune commande pour ce filtre."
            : "Aucun résultat pour cette recherche."}
        </div>
      )}
    </div>
  );
}
