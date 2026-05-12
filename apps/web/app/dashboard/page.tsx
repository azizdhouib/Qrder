"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  QrCode,
  UtensilsCrossed,
  ChefHat,
  History,
  RefreshCw,
  TrendingUp,
  Users,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
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
function rangeForPeriod(period: Period) {
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
  CANCELLED: "Annulé",
};

const STATUS_COLOR: Record<string, string> = {
  PLACED: "var(--status-placed, #f59e0b)",
  PREPARING: "var(--status-preparing, #3b82f6)",
  READY: "var(--status-ready, #10b981)",
  SERVED: "var(--status-served, #6366f1)",
  CANCELLED: "var(--status-cancelled, #ef4444)",
};

const ACTIONS = [
  {
    href: "/dashboard/tables",
    icon: QrCode,
    title: "Tables + QR codes",
    desc: "Créer les tables, générer et télécharger les QR codes par salle.",
  },
  {
    href: "/dashboard/menu",
    icon: UtensilsCrossed,
    title: "Gestion du menu",
    desc: "Configurer catégories, plats, prix et options.",
  },
  {
    href: "/dashboard/kitchen",
    icon: ChefHat,
    title: "Écran cuisine (KDS)",
    desc: "Vue cuisine en temps réel — commandes, temps, tables.",
  },
  {
    href: "/dashboard/history",
    icon: History,
    title: "Historique",
    desc: "Parcourir et filtrer toutes les commandes passées.",
  },
] as const;

export default function DashboardPage() {
  return (
    <main className="container stack">
      <DashboardAnalyticsLoader />
    </main>
  );
}

function DashboardAnalyticsLoader() {
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    setToken(localStorage.getItem("qrder_token") ?? "");
  }, []);

  if (token === undefined) return null;

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

  return <DashboardOverview token={token} />;
}

function DashboardOverview({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { from, to } = useMemo(() => rangeForPeriod(period), [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const res = await apiFetch<AnalyticsResponse>(`/dashboard/analytics${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
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

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setSpinning(false), 700);
    load().catch(() => {});
  }, [load]);

  const periodLabel =
    period === "day" ? "Aujourd'hui" : period === "week" ? "Cette semaine" : "Ce mois";

  const maxTopQty = useMemo(
    () => Math.max(...(data?.topItems.map((i) => i.quantitySold) ?? []), 1),
    [data]
  );

  const totalByStatus = useMemo(
    () => data?.byStatus.reduce((s, r) => s + r.count, 0) ?? 0,
    [data]
  );

  return (
    <div className="ov-root stack">

      {/* ── Header ── */}
      <div className="ov-header">
        <div className="ov-header-left">
          <span className="badge">Vue d&apos;ensemble</span>
          <h1 className="ov-title">Pilotage</h1>
          <p className="ov-subtitle muted">{periodLabel}</p>
        </div>
        <div className="ov-period-bar" role="tablist" aria-label="Période">
          {(
            [
              ["day", "Aujourd'hui"],
              ["week", "Cette semaine"],
              ["month", "Ce mois"],
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
          <button
            type="button"
            className="ov-refresh-btn"
            onClick={handleRefresh}
            aria-label="Rafraîchir"
            title="Rafraîchir"
          >
            <RefreshCw size={15} className={spinning ? "ov-spin" : ""} strokeWidth={2} />
          </button>
        </div>
      </div>

      {err && (
        <div className="panel pill-inactive">
          <p className="muted" style={{ margin: 0 }}>{err}</p>
        </div>
      )}

      {loading && !data && (
        <div className="ov-skeleton-strip" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="ov-skeleton-cell" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ── KPI strip ── */}
          <ul className="ov-kpi-strip" aria-label="Indicateurs clés">
            <li className="ov-kpi">
              <TrendingUp className="ov-kpi-icon" size={18} strokeWidth={1.75} aria-hidden />
              <span className="ov-kpi-val">{formatEur(data.revenueCents)}</span>
              <span className="ov-kpi-label">Chiffre d&apos;affaires</span>
            </li>
            <li className="ov-kpi">
              <ShoppingBag className="ov-kpi-icon" size={18} strokeWidth={1.75} aria-hidden />
              <span className="ov-kpi-val">{data.orderCount}</span>
              <span className="ov-kpi-label">Commandes</span>
            </li>
            <li className="ov-kpi">
              <Users className="ov-kpi-icon" size={18} strokeWidth={1.75} aria-hidden />
              <span className="ov-kpi-val">{data.distinctTablesWithOrders}</span>
              <span className="ov-kpi-label">Tables actives</span>
            </li>
            <li className="ov-kpi">
              <CheckCircle2 className="ov-kpi-icon" size={18} strokeWidth={1.75} aria-hidden />
              <span className="ov-kpi-val">
                {data.servedRate != null
                  ? `${(data.servedRate * 100).toFixed(0)} %`
                  : "—"}
              </span>
              <span className="ov-kpi-label">Taux de service</span>
            </li>
          </ul>

          {/* ── Body grid ── */}
          <div className="ov-body-grid">

            {/* Top articles */}
            <div className="panel ov-panel">
              <h2 className="panel-title ov-panel-title">Top articles</h2>
              {data.topItems.length === 0 ? (
                <p className="muted">Aucune vente sur cette période.</p>
              ) : (
                <ol className="ov-top-list">
                  {data.topItems.slice(0, 8).map((item, i) => (
                    <li key={`${item.name}-${i}`} className="ov-top-item">
                      <div className="ov-top-meta">
                        <span className="ov-top-rank">{i + 1}</span>
                        <span className="ov-top-name">{item.name}</span>
                        <span className="ov-top-figures muted">
                          {item.quantitySold}&times; &middot; {formatEur(item.revenueCents)}
                        </span>
                      </div>
                      <div className="ov-top-bar-track" aria-hidden>
                        <div
                          className="ov-top-bar-fill"
                          style={{ width: `${(item.quantitySold / maxTopQty) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Répartition statuts */}
            <div className="panel ov-panel">
              <h2 className="panel-title ov-panel-title">Flux des commandes</h2>
              {data.byStatus.length === 0 ? (
                <p className="muted">Aucune commande sur cette période.</p>
              ) : (
                <ul className="ov-status-list">
                  {data.byStatus
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((row) => {
                      const pct = totalByStatus > 0 ? (row.count / totalByStatus) * 100 : 0;
                      return (
                        <li key={row.status} className="ov-status-row">
                          <div className="ov-status-row-top">
                            <span
                              className="ov-status-dot"
                              style={{ background: STATUS_COLOR[row.status] ?? "#888" }}
                              aria-hidden
                            />
                            <span className="ov-status-name">
                              {STATUS_FR[row.status] ?? row.status}
                            </span>
                            <span className="ov-status-count tabular-nums">{row.count}</span>
                            <span className="ov-status-pct muted tabular-nums">
                              {pct.toFixed(0)} %
                            </span>
                          </div>
                          <div className="ov-status-bar-track" aria-hidden>
                            <div
                              className="ov-status-bar-fill"
                              style={{
                                width: `${pct}%`,
                                background: STATUS_COLOR[row.status] ?? "#888",
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}

              {/* Panier moyen en bas du panel */}
              <div className="ov-basket-row">
                <span className="muted">Panier moyen</span>
                <strong>{formatEur(data.averageBasketCents)}</strong>
              </div>
            </div>

          </div>
        </>
      )}

      {/* ── Actions rapides ── */}
      <section className="ov-actions-section">
        <h2 className="ov-actions-title">Accès rapides</h2>
        <div className="ov-actions-grid">
          {ACTIONS.map(({ href, icon: Icon, title, desc }) => (
            <Link key={href} href={href} className="ov-action-card">
              <span className="ov-action-icon-wrap" aria-hidden>
                <Icon size={22} strokeWidth={1.75} />
              </span>
              <div className="ov-action-body">
                <p className="ov-action-title">{title}</p>
                <p className="ov-action-desc muted">{desc}</p>
              </div>
              <span className="ov-action-arrow" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
