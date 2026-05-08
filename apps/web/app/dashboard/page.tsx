"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Period = "day" | "week" | "month";

type AnalyticsResponse = {
  from: string;
  to: string;
  computedAt: string;
  revenueCents: number;
  revenueOrderHeaderCents: number;
  totalsMismatchCents: number;
  lineItemsCount: number;
  orderCount: number;
  averageBasketCents: number;
  distinctTablesWithOrders: number;
  cancelledOrders: number;
  servedOrders: number;
  servedRate: number | null;
  byStatus: { status: string; count: number }[];
  topItems: { name: string; quantitySold: number; revenueCents: number }[];
};

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Semaine calendaire commençant lundi (usage France). */
function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function rangeForPeriod(period: Period): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") return { from: startOfLocalDay(now), to: now };
  if (period === "week") return { from: startOfWeekMonday(now), to: now };
  return { from: startOfMonth(now), to: now };
}

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const STATUS_FR: Record<string, string> = {
  PLACED: "En attente",
  PREPARING: "En préparation",
  READY: "Prêt",
  SERVED: "Servi",
  CANCELLED: "Annulé"
};

export default function DashboardPage() {
  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Vue d&apos;ensemble</span>
        <h1 className="hero-title">Pilotage</h1>
      </section>
      <DashboardAnalyticsLoader />
    </main>
  );
}

function DashboardAnalyticsLoader() {
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    setToken(localStorage.getItem("qrder_token") ?? "");
  }, []);

  if (token === undefined) {
    return <p className="muted">Chargement…</p>;
  }

  if (!token) {
    return (
      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          Session requise.{" "}
          <Link href="/dashboard/auth" className="link-inline">
            Se connecter
          </Link>
        </p>
      </div>
    );
  }

  return <DashboardAnalytics token={token} />;
}

function DashboardAnalytics({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const { from, to } = useMemo(() => rangeForPeriod(period), [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const res = await apiFetch<AnalyticsResponse>(`/dashboard/analytics${qs}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de chargement");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, from, to]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const periodLabel =
    period === "day" ? "Aujourd'hui" : period === "week" ? "Cette semaine" : "Ce mois";

  const rangeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: period === "month" ? undefined : "2-digit",
        minute: period === "month" ? undefined : "2-digit"
      }),
    [period]
  );

  return (
    <div className="stack dashboard-analytics">
      <div className="menu-tabs analytics-period-tabs" role="tablist" aria-label="Periode">
        {(
          [
            ["day", "Aujourd'hui"],
            ["week", "Cette semaine"],
            ["month", "Ce mois"]
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            className={`menu-tab${period === p ? " menu-tab-active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn-secondary btn-compact menu-tab-refresh" onClick={() => load()}>
          Rafraîchir
        </button>
      </div>

      {err && (
        <div className="panel pill-inactive">
          <p className="muted" style={{ margin: 0 }}>
            {err}
          </p>
        </div>
      )}

      {loading && !data && <p className="muted">Chargement…</p>}

      {data && (
        <>
          <p className="muted analytics-range-caption">
            <strong>{periodLabel}</strong> — du {rangeFormatter.format(new Date(data.from))} au{" "}
            {rangeFormatter.format(new Date(data.to))}
          </p>

          <div className="grid grid-2 analytics-kpi-grid">
            <div className="panel analytics-kpi">
              <p className="analytics-kpi-label">Chiffre d&apos;affaires</p>
              <p className="analytics-kpi-value">{formatEur(data.revenueCents)}</p>
            </div>
            <div className="panel analytics-kpi">
              <p className="analytics-kpi-label">Commandes</p>
              <p className="analytics-kpi-value">{data.orderCount}</p>
            </div>
            <div className="panel analytics-kpi">
              <p className="analytics-kpi-label">Panier moyen</p>
              <p className="analytics-kpi-value">{formatEur(data.averageBasketCents)}</p>
            </div>
            <div className="panel analytics-kpi">
              <p className="analytics-kpi-label">Tables actives</p>
              <p className="analytics-kpi-value">{data.distinctTablesWithOrders}</p>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="panel">
              <h3 className="panel-title">Service &amp; annulations</h3>
              <ul className="analytics-metric-list">
                <li>
                  <span className="muted">Commandes servies</span>
                  <strong>{data.servedOrders}</strong>
                </li>
                <li>
                  <span className="muted">Taux de service</span>
                  <strong>
                    {data.servedRate != null ? `${(data.servedRate * 100).toFixed(1)} %` : "—"}
                  </strong>
                </li>
                <li>
                  <span className="muted">Annulations</span>
                  <strong>{data.cancelledOrders}</strong>
                </li>
              </ul>
            </div>
            <div className="panel">
              <h3 className="panel-title">Répartition par statut</h3>
              {data.byStatus.length === 0 ? (
                <p className="muted">Aucune commande sur cette période.</p>
              ) : (
                <ul className="analytics-status-list">
                  {data.byStatus
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((row) => (
                      <li key={row.status}>
                        <span className={`status ${statusClass(row.status)}`}>
                          {STATUS_FR[row.status] ?? row.status}
                        </span>
                        <span className="analytics-status-count tabular-nums">{row.count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">Top articles</h3>
            {data.topItems.length === 0 ? (
              <p className="muted">Aucune vente sur cette période.</p>
            ) : (
              <ol className="analytics-top-list">
                {data.topItems.map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    <span className="analytics-top-name">{item.name}</span>
                    <span className="muted analytics-top-meta">
                      {item.quantitySold} vendus · {formatEur(item.revenueCents)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      <section>
        <h2 className="section-title">Accès rapides</h2>
        <div className="grid grid-2">
          <a className="link-card" href="/dashboard/tables">
            <p className="section-title">Tables + QR</p>
            <p className="muted">Créer les tables, générer et télécharger les QR codes.</p>
          </a>
          <a className="link-card" href="/dashboard/menu">
            <p className="section-title">Gestion menu</p>
            <p className="muted">Configurer catégories, plats, prix et options.</p>
          </a>
          <a className="link-card" href="/dashboard/kitchen">
            <p className="section-title">Interface cuisine</p>
            <p className="muted">Commandes en live et statuts.</p>
          </a>
          <a className="link-card" href="/dashboard/history">
            <p className="section-title">Historique</p>
            <p className="muted">Parcourir toutes les commandes détaillées.</p>
          </a>
        </div>
      </section>
    </div>
  );
}

function statusClass(status: string) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  if (status === "SERVED") return "status-served";
  if (status === "CANCELLED") return "status-cancelled";
  return "status-served";
}
