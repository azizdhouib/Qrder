"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type Period = "day" | "week" | "month";

type Summary = {
  from: string;
  to: string;
  computedAt: string;
  billCount: number;
  totalCents: number;
  byPaymentMethod: { CASH: number; CARD: number; OTHER: number };
};

type BillRow = {
  id: string;
  invoiceNumber: number;
  totalCents: number;
  paymentMethod: "CASH" | "CARD" | "OTHER";
  createdAt: string;
  table: { name: string };
  orders: { orderNumber: number; totalCents: number }[];
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

function rangeForPeriod(period: Period): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") return { from: startOfLocalDay(now), to: now };
  if (period === "week") return { from: startOfWeekMonday(now), to: now };
  return { from: startOfMonth(now), to: now };
}

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const PAYMENT_FR: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  OTHER: "Autre"
};

export default function ComptaPage() {
  return (
    <main className="compta-page">
      <TokenGate>{(token) => <ComptaBody token={token} />}</TokenGate>
    </main>
  );
}

function ComptaBody({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("week");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeForPeriod(period), [period]);

  const load = useCallback(async () => {
    setLoading(true);
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    const qs = `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    try {
      const [sum, list] = await Promise.all([
        apiFetch<Summary>(`/caisse/summary${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<BillRow[]>(`/caisse/bills${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSummary(sum);
      setBills(list);
    } catch (e) {
      console.error(e);
      setSummary(null);
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [token, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="compta-stack">
      <header className="compta-header">
        <div>
          <p className="compta-kicker">Suivi</p>
          <h1 className="compta-title">Compta — encaissements</h1>
          <p className="compta-lead muted">
            Totaux issus des factures enregistrées en <Link href="/dashboard/caisse">caisse</Link> (hors commandes non
            encaissées). Pour exports détaillés, TVA, ZIP factures et journal d&apos;audit :{" "}
            <Link href="/dashboard/export-compta" className="link-inline">
              Export compta
            </Link>
            .
          </p>
        </div>
        <div className="compta-periods" role="tablist" aria-label="Période">
          {(
            [
              ["day", "Aujourd’hui"],
              ["week", "Semaine"],
              ["month", "Mois"]
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={period === k}
              className={`compta-period${period === k ? " compta-period--active" : ""}`}
              onClick={() => setPeriod(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : !summary ? (
        <p className="muted">Aucune donnée.</p>
      ) : (
        <>
          <div className="compta-kpis">
            <article className="compta-kpi panel">
              <p className="compta-kpi-label muted">Encaissé (période)</p>
              <p className="compta-kpi-value tabular-nums">{formatEur(summary.totalCents)}</p>
              <p className="compta-kpi-foot muted">{summary.billCount} facture{summary.billCount !== 1 ? "s" : ""}</p>
            </article>
            <article className="compta-kpi panel">
              <p className="compta-kpi-label muted">Espèces</p>
              <p className="compta-kpi-value tabular-nums">{formatEur(summary.byPaymentMethod.CASH)}</p>
            </article>
            <article className="compta-kpi panel">
              <p className="compta-kpi-label muted">Carte</p>
              <p className="compta-kpi-value tabular-nums">{formatEur(summary.byPaymentMethod.CARD)}</p>
            </article>
            <article className="compta-kpi panel">
              <p className="compta-kpi-label muted">Autre</p>
              <p className="compta-kpi-value tabular-nums">{formatEur(summary.byPaymentMethod.OTHER)}</p>
            </article>
          </div>

          <section className="compta-bills panel">
            <div className="compta-bills-head">
              <h2 className="compta-bills-title">Journal des factures</h2>
              <button type="button" className="btn-secondary" onClick={() => void load()}>
                Rafraîchir
              </button>
            </div>
            {bills.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Aucune facture sur cette période.
              </p>
            ) : (
              <div className="compta-table-wrap">
                <table className="compta-table">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Date</th>
                      <th>Table</th>
                      <th>Paiement</th>
                      <th>Montant</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b) => (
                      <tr key={b.id}>
                        <td className="tabular-nums">{b.invoiceNumber}</td>
                        <td>{new Date(b.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td>{b.table.name}</td>
                        <td>{PAYMENT_FR[b.paymentMethod] ?? b.paymentMethod}</td>
                        <td className="tabular-nums">{formatEur(b.totalCents)}</td>
                        <td>
                          <Link href={`/dashboard/caisse/facture/${b.id}`} className="link-inline">
                            Voir
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
