"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { apiFetch } from "@/lib/api";
import { downloadDailyClosePdf, downloadVatReportPdf } from "@/lib/accountingPdf";
import { rangeForAccountingPreset, type AccountingPeriodPreset } from "@/lib/accountingDateRange";
import { downloadTextFile, rowsToCsv } from "@/lib/csvDownload";
import { normalizeBillPayload } from "@/lib/invoiceNormalize";
import type { InvoiceBillPayload } from "@/lib/invoiceTypes";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

type AccountantDashboardResponse = {
  restaurantName: string;
  caFactureCents: number;
  tvaCollecteeCents: number;
  ticketCount: number;
  panierMoyenTicketCents: number;
  orderCount: number;
  hourlyOrders: number[];
  topProducts: { name: string; quantitySold: number; revenueCents: number }[];
};

type SalesLineRow = {
  date: string;
  heure: string;
  numeroCommande: number;
  numeroFacture: number | null;
  table: string;
  typeCommande: string;
  montantHtCentimes: number;
  tvaCentimes: number;
  tauxTvaPercent: number | null;
  montantTtcCentimes: number;
  moyenPaiement: string;
  statutPaiement: string;
  serveur: string;
  client: string;
};

type SalesLinesResponse = {
  rows: SalesLineRow[];
};

type VatReportResponse = {
  restaurantName: string;
  restaurantVatMode: string;
  totals: { htCents: number; tvaCents: number; ttcCents: number };
  buckets: {
    rate10: { label: string; htCents: number; tvaCents: number; ttcCents: number };
    rate20: { label: string; htCents: number; tvaCents: number; ttcCents: number };
    rate55: { label: string; htCents: number; tvaCents: number; ttcCents: number };
    exempt: { label: string; htCents: number; tvaCents: number; ttcCents: number };
  };
  note?: string;
};

type DailyCloseResponse = {
  from: string;
  to: string;
  computedAt: string;
  restaurantName: string;
  chiffreAffairesFactureCents: number;
  nombreCommandesCommerce: number;
  panierMoyenCents: number;
  totalCbCents: number;
  totalEspecesCents: number;
  totalAutresPaiementsCents: number;
  reductionsCents: number;
  pourboiresCents: number;
  fraisProcesseurCents: number;
  annulations: { count: number; totalCommandeTtcCents: number };
  heuresForteActivite: { buckets: number[]; peakHourLabel: string };
  nombreFactures: number;
  tvaCollecteeFacturesCents: number;
};

type BillsListResponse = {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: string;
    invoiceNumber: number;
    totalCents: number;
    paymentMethod: string;
    createdAt: string;
    htCents: number;
    tvaCents: number;
    ttcCents: number;
    table: { name: string };
  }[];
};

type PaymentsReportResponse = {
  totalEncaisseCents: number;
  detailParMoyen: { especesCents: number; carteCents: number; autreCents: number };
  pourboiresCents: number;
  remboursementsCents: number;
  fraisStripeOuProcesseurCents: number;
  montantNetRecuCents: number;
  stripeNote: string | null;
};

type AuditLogsResponse = {
  items: { id: string; createdAt: string; action: string; detail: string; userEmail: string | null }[];
};

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type TabId = "dashboard" | "sales" | "vat" | "close" | "bills" | "payments" | "audit" | "integrations";

function buildMiniBillPdf(bill: InvoiceBillPayload): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = 18;
  doc.setFontSize(16);
  doc.text(`Facture n° ${bill.invoiceNumber}`, 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(bill.restaurant.legalName ?? bill.restaurant.name, 14, y);
  y += 6;
  doc.text(`Date : ${new Date(bill.createdAt).toLocaleString("fr-FR")}`, 14, y);
  y += 6;
  doc.text(`Table : ${bill.table.name}`, 14, y);
  y += 6;
  doc.text(`Total TTC : ${formatEur(bill.totalCents)}`, 14, y);
  y += 6;
  doc.text(`Réf. : ${bill.paymentReference}`, 14, y);
  return doc.output("blob");
}

export function ExportComptaModule({ token }: { token: string }) {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [preset, setPreset] = useState<AccountingPeriodPreset>("week");
  const [customFromYmd, setCustomFromYmd] = useState(() => toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customToYmd, setCustomToYmd] = useState(() => toYmd(new Date()));
  const [axisColor, setAxisColor] = useState("#71717a");

  const customFromDate = useMemo(() => new Date(`${customFromYmd}T00:00:00`), [customFromYmd]);
  const customToDate = useMemo(() => new Date(`${customToYmd}T23:59:59.999`), [customToYmd]);

  const range = useMemo(
    () =>
      rangeForAccountingPreset(
        preset,
        preset === "custom" ? customFromDate : null,
        preset === "custom" ? customToDate : null
      ),
    [preset, customFromDate, customToDate]
  );

  const qs = useMemo(
    () => `?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`,
    [preset, range.from.getTime(), range.to.getTime()]
  );

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setAxisColor(el.getAttribute("data-theme") === "dark" ? "#a1a1aa" : "#71717a");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  /* ——— Dashboard comptable ——— */
  const [dash, setDash] = useState<AccountantDashboardResponse | null>(null);

  const loadDash = useCallback(async () => {
    const d = await apiFetch<AccountantDashboardResponse>(`/accounting/accountant-dashboard${qs}`, { headers: auth });
    setDash(d);
  }, [qs, auth]);

  /* ——— Ventes ——— */
  const [sales, setSales] = useState<SalesLinesResponse | null>(null);

  const loadSales = useCallback(async () => {
    const s = await apiFetch<SalesLinesResponse>(`/accounting/sales-lines${qs}`, { headers: auth });
    setSales(s);
  }, [qs, auth]);

  const exportSalesCsv = (sep: "comma" | "semicolon") => {
    if (!sales?.rows.length) return;
    const header = [
      "date",
      "heure",
      "numero_commande",
      "numero_facture",
      "table",
      "type_commande",
      "montant_ht_eur",
      "tva_eur",
      "taux_tva_pct",
      "montant_ttc_eur",
      "moyen_paiement",
      "statut_paiement",
      "serveur",
      "client"
    ];
    const dataRows = sales.rows.map((r) => [
      r.date,
      r.heure,
      r.numeroCommande,
      r.numeroFacture ?? "",
      r.table,
      r.typeCommande,
      (r.montantHtCentimes / 100).toFixed(2),
      (r.tvaCentimes / 100).toFixed(2),
      r.tauxTvaPercent ?? "",
      (r.montantTtcCentimes / 100).toFixed(2),
      r.moyenPaiement,
      r.statutPaiement,
      r.serveur,
      r.client
    ]);
    const csv = rowsToCsv([header, ...dataRows], sep === "semicolon" ? "semicolon" : "comma");
    downloadTextFile(
      sep === "semicolon" ? `qrder-ventes-excel-${preset}.csv` : `qrder-ventes-${preset}.csv`,
      csv
    );
  };

  /* ——— TVA ——— */
  const [vat, setVat] = useState<VatReportResponse | null>(null);

  const loadVat = useCallback(async () => {
    const v = await apiFetch<VatReportResponse>(`/accounting/vat-report${qs}`, { headers: auth });
    setVat(v);
  }, [qs, auth]);

  const vatChartData = useMemo(() => {
    if (!vat) return [];
    return [
      { name: "10 %", tva: vat.buckets.rate10.tvaCents / 100, ht: vat.buckets.rate10.htCents / 100 },
      { name: "20 %", tva: vat.buckets.rate20.tvaCents / 100, ht: vat.buckets.rate20.htCents / 100 },
      { name: "5,5 %", tva: vat.buckets.rate55.tvaCents / 100, ht: vat.buckets.rate55.htCents / 100 },
      { name: "Exo.", tva: vat.buckets.exempt.tvaCents / 100, ht: vat.buckets.exempt.htCents / 100 }
    ];
  }, [vat]);

  /* ——— Clôture ——— */
  const [close, setClose] = useState<DailyCloseResponse | null>(null);

  const loadClose = useCallback(async () => {
    const c = await apiFetch<DailyCloseResponse>(`/accounting/daily-close${qs}`, { headers: auth });
    setClose(c);
  }, [qs, auth]);

  /* ——— Factures liste ——— */
  const [billQ, setBillQ] = useState("");
  const [billPage, setBillPage] = useState(1);
  const [billsRes, setBillsRes] = useState<BillsListResponse | null>(null);

  const loadBills = useCallback(async () => {
    const q = billQ.trim() ? `&q=${encodeURIComponent(billQ.trim())}` : "";
    const b = await apiFetch<BillsListResponse>(`/accounting/bills${qs}&page=${billPage}&pageSize=20${q}`, {
      headers: auth
    });
    setBillsRes(b);
  }, [qs, auth, billPage, billQ]);

  const [zipBusy, setZipBusy] = useState(false);

  const downloadBillsZip = async () => {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("factures-qrder");
      let page = 1;
      const pageSize = 15;
      let totalPages = 1;
      const maxBills = 45;
      let count = 0;
      while (page <= totalPages && count < maxBills) {
        const q = billQ.trim() ? `&q=${encodeURIComponent(billQ.trim())}` : "";
        const res = await apiFetch<BillsListResponse>(`/accounting/bills${qs}&page=${page}&pageSize=${pageSize}${q}`, {
          headers: auth
        });
        totalPages = Math.max(1, Math.ceil(res.total / pageSize));
        for (const it of res.items) {
          if (count >= maxBills) break;
          const raw = await apiFetch<Record<string, unknown>>(`/caisse/bills/${it.id}`, { headers: auth });
          const bill = normalizeBillPayload(raw);
          const blob = buildMiniBillPdf(bill);
          folder?.file(`facture-${bill.invoiceNumber}.pdf`, blob);
          count++;
        }
        page++;
        if (res.items.length === 0) break;
      }
      const out = await zip.generateAsync({ type: "blob" });
      if (count === 0) {
        window.alert("Aucune facture à inclure dans le ZIP pour cette période.");
        return;
      }
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qrder-factures-${range.from.toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipBusy(false);
    }
  };

  /* ——— Paiements ——— */
  const [pay, setPay] = useState<PaymentsReportResponse | null>(null);

  const loadPay = useCallback(async () => {
    const p = await apiFetch<PaymentsReportResponse>(`/accounting/payments-report${qs}`, { headers: auth });
    setPay(p);
  }, [qs, auth]);

  /* ——— Audit ——— */
  const [audit, setAudit] = useState<AuditLogsResponse | null>(null);

  const loadAudit = useCallback(async () => {
    const a = await apiFetch<AuditLogsResponse>(`/accounting/audit-logs${qs}&take=200`, { headers: auth });
    setAudit(a);
  }, [qs, auth]);

  const [integrations, setIntegrations] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (tab === "integrations") {
      apiFetch<Record<string, unknown>>("/accounting/integrations", { headers: auth }).then(setIntegrations).catch(console.error);
    }
  }, [tab, auth]);

  useEffect(() => {
    if (tab === "dashboard") void loadDash().catch(console.error);
    if (tab === "sales") void loadSales().catch(console.error);
    if (tab === "vat") void loadVat().catch(console.error);
    if (tab === "close") {
      setClose(null);
      void loadClose().catch(console.error);
    }
    if (tab === "bills") void loadBills().catch(console.error);
    if (tab === "payments") void loadPay().catch(console.error);
    if (tab === "audit") void loadAudit().catch(console.error);
  }, [tab, preset, qs, loadDash, loadSales, loadVat, loadClose, loadBills, loadPay, loadAudit]);

  const hourlyChartData = useMemo(() => {
    if (!dash?.hourlyOrders) return [];
    return dash.hourlyOrders.map((n, h) => ({ h: `${h}h`, commandes: n }));
  }, [dash]);

  const payChartData = useMemo(() => {
    if (!pay) return [];
    return [
      { name: "Espèces", montant: pay.detailParMoyen.especesCents / 100 },
      { name: "Carte", montant: pay.detailParMoyen.carteCents / 100 },
      { name: "Autre", montant: pay.detailParMoyen.autreCents / 100 }
    ];
  }, [pay]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "dashboard", label: "Vue comptable" },
    { id: "sales", label: "Ventes" },
    { id: "vat", label: "TVA" },
    { id: "close", label: "Clôture" },
    { id: "bills", label: "Factures" },
    { id: "payments", label: "Paiements" },
    { id: "audit", label: "Journal" },
    { id: "integrations", label: "Intégrations" }
  ];

  return (
    <div className="export-compta-stack">
      <header className="acc-module-header">
        <div>
          <p className="compta-kicker">Comptabilité</p>
          <h1 className="compta-title">Export compta</h1>
          <p className="compta-lead muted">
            Exports CSV / PDF, rapports TVA et clôture, conformité France. Données issues des encaissements{" "}
            <Link href="/dashboard/caisse" className="link-inline">
              caisse
            </Link>{" "}
            et des commandes.
          </p>
        </div>
      </header>

      <div className="acc-main-tabs" role="tablist" aria-label="Sections export compta">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`acc-main-tab${tab === t.id ? " acc-main-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="acc-period-row panel" style={{ padding: "1rem 1.15rem" }}>
        <div className="compta-periods" role="tablist" aria-label="Période">
          {(
            [
              ["day", "Aujourd’hui"],
              ["week", "Cette semaine"],
              ["month", "Ce mois"],
              ["custom", "Personnalisée"]
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={preset === k}
              className={`compta-period${preset === k ? " compta-period--active" : ""}`}
              onClick={() => setPreset(k)}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="acc-custom-range">
            <label className="muted" style={{ fontSize: "0.8125rem" }}>
              Du
            </label>
            <input
              type="date"
              className="acc-date-input"
              value={customFromYmd}
              onChange={(e) => setCustomFromYmd(e.target.value)}
            />
            <label className="muted" style={{ fontSize: "0.8125rem" }}>
              au
            </label>
            <input
              type="date"
              className="acc-date-input"
              value={customToYmd}
              onChange={(e) => setCustomToYmd(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {tab === "dashboard" && (
        <section className="stack">
          {!dash ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <div className="compta-kpis">
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">CA facturé (période)</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(dash.caFactureCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">TVA collectée (estim.)</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(dash.tvaCollecteeCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Tickets</p>
                  <p className="compta-kpi-value tabular-nums">{dash.ticketCount}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Panier moyen (ticket)</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(dash.panierMoyenTicketCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Commandes (hors annul.)</p>
                  <p className="compta-kpi-value tabular-nums">{dash.orderCount}</p>
                </article>
              </div>
              <div className="compta-bills panel">
                <h2 className="compta-bills-title">Commandes par heure</h2>
                <div className="acc-chart-wrap acc-chart-wrap--sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="accHrFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--border), transparent 30%)" vertical={false} />
                      <XAxis dataKey="h" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--card)"
                        }}
                      />
                      <Area type="monotone" dataKey="commandes" stroke="var(--primary)" fill="url(#accHrFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="compta-bills panel">
                <h2 className="compta-bills-title">Meilleures ventes</h2>
                <div className="compta-table-wrap">
                  <table className="compta-table">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>Qté</th>
                        <th>CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.topProducts.map((p) => (
                        <tr key={p.name}>
                          <td>{p.name}</td>
                          <td className="tabular-nums">{p.quantitySold}</td>
                          <td className="tabular-nums">{formatEur(p.revenueCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "sales" && (
        <section className="compta-bills panel">
          <div className="compta-bills-head">
            <h2 className="compta-bills-title">Export des ventes</h2>
            <div className="acc-actions-row">
              <button type="button" className="btn-secondary" onClick={() => void loadSales()}>
                Rafraîchir
              </button>
              <button type="button" className="btn-primary-ios" onClick={() => exportSalesCsv("comma")} disabled={!sales?.rows.length}>
                Export CSV
              </button>
              <button type="button" className="btn-primary-ios" onClick={() => exportSalesCsv("semicolon")} disabled={!sales?.rows.length}>
                Export Excel (CSV ;)
              </button>
            </div>
          </div>
          {!sales ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <p className="acc-muted-note">{sales.rows.length} ligne(s) — colonnes adaptées comptabilité française (TTC catalogue).</p>
              <div className="compta-table-wrap">
                <table className="compta-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Commande</th>
                      <th>Facture</th>
                      <th>Type</th>
                      <th>HT</th>
                      <th>TVA</th>
                      <th>TTC</th>
                      <th>Paiement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.rows.slice(0, 80).map((r, i) => (
                      <tr key={`${r.numeroCommande}-${i}`}>
                        <td>
                          {r.date} {r.heure}
                        </td>
                        <td className="tabular-nums">#{r.numeroCommande}</td>
                        <td className="tabular-nums">{r.numeroFacture ?? "—"}</td>
                        <td>{r.typeCommande}</td>
                        <td className="tabular-nums">{(r.montantHtCentimes / 100).toFixed(2)} €</td>
                        <td className="tabular-nums">{(r.tvaCentimes / 100).toFixed(2)} €</td>
                        <td className="tabular-nums">{(r.montantTtcCentimes / 100).toFixed(2)} €</td>
                        <td>{r.statutPaiement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "vat" && (
        <section className="stack">
          {!vat ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <div className="compta-kpis">
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Total HT</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(vat.totals.htCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Total TVA</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(vat.totals.tvaCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Total TTC</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(vat.totals.ttcCents)}</p>
                </article>
              </div>
              <div className="compta-bills panel">
                <div className="compta-bills-head">
                  <h2 className="compta-bills-title">Ventilation par taux</h2>
                  <div className="acc-actions-row">
                    <button type="button" className="btn-secondary" onClick={() => void loadVat()}>
                      Rafraîchir
                    </button>
                    <button
                      type="button"
                      className="btn-primary-ios"
                      onClick={() => {
                        const rows = [
                          ["taux", "ht_eur", "tva_eur", "ttc_eur"],
                          ["10 %", (vat.buckets.rate10.htCents / 100).toFixed(2), (vat.buckets.rate10.tvaCents / 100).toFixed(2), (vat.buckets.rate10.ttcCents / 100).toFixed(2)],
                          ["20 %", (vat.buckets.rate20.htCents / 100).toFixed(2), (vat.buckets.rate20.tvaCents / 100).toFixed(2), (vat.buckets.rate20.ttcCents / 100).toFixed(2)],
                          ["5,5 %", (vat.buckets.rate55.htCents / 100).toFixed(2), (vat.buckets.rate55.tvaCents / 100).toFixed(2), (vat.buckets.rate55.ttcCents / 100).toFixed(2)],
                          ["Exonéré", (vat.buckets.exempt.htCents / 100).toFixed(2), (vat.buckets.exempt.tvaCents / 100).toFixed(2), (vat.buckets.exempt.ttcCents / 100).toFixed(2)]
                        ];
                        downloadTextFile(`qrder-tva-${preset}.csv`, rowsToCsv(rows, "semicolon"));
                      }}
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      className="btn-primary-ios"
                      onClick={() =>
                        downloadVatReportPdf({
                          restaurantName: vat.restaurantName,
                          fromIso: range.from.toISOString(),
                          toIso: range.to.toISOString(),
                          totals: vat.totals,
                          buckets: vat.buckets,
                          note: vat.note
                        })
                      }
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
                <div className="compta-table-wrap">
                  <table className="compta-table">
                    <thead>
                      <tr>
                        <th>Taux</th>
                        <th>HT</th>
                        <th>TVA</th>
                        <th>TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{vat.buckets.rate10.label}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate10.htCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate10.tvaCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate10.ttcCents)}</td>
                      </tr>
                      <tr>
                        <td>{vat.buckets.rate20.label}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate20.htCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate20.tvaCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate20.ttcCents)}</td>
                      </tr>
                      <tr>
                        <td>{vat.buckets.rate55.label}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate55.htCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate55.tvaCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.rate55.ttcCents)}</td>
                      </tr>
                      <tr>
                        <td>{vat.buckets.exempt.label}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.exempt.htCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.exempt.tvaCents)}</td>
                        <td className="tabular-nums">{formatEur(vat.buckets.exempt.ttcCents)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {vat.note ? <p className="acc-muted-note">{vat.note}</p> : null}
                <div className="acc-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vatChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--border), transparent 30%)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--card)"
                        }}
                      />
                      <Bar dataKey="tva" name="TVA (€)" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "close" && (
        <section className="compta-bills panel">
          {!close ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <div className="compta-bills-head">
                <h2 className="compta-bills-title">Rapport journalier / clôture</h2>
                <div className="acc-actions-row">
                  <button type="button" className="btn-secondary" onClick={() => void loadClose()}>
                    Rafraîchir
                  </button>
                  <button
                    type="button"
                    className="btn-primary-ios"
                    onClick={() => {
                      const lines = [
                        { label: "Chiffre d’affaires (facturé)", value: formatEur(close.chiffreAffairesFactureCents) },
                        { label: "Nombre de commandes", value: String(close.nombreCommandesCommerce) },
                        { label: "Panier moyen", value: formatEur(close.panierMoyenCents) },
                        { label: "Total CB", value: formatEur(close.totalCbCents) },
                        { label: "Total espèces", value: formatEur(close.totalEspecesCents) },
                        { label: "Autres paiements", value: formatEur(close.totalAutresPaiementsCents) },
                        { label: "Réductions (sur factures)", value: formatEur(close.reductionsCents) },
                        { label: "Pourboires", value: formatEur(close.pourboiresCents) },
                        { label: "Frais processeur", value: formatEur(close.fraisProcesseurCents) },
                        { label: "Annulations (nombre)", value: String(close.annulations.count) },
                        { label: "TVA collectée (factures)", value: formatEur(close.tvaCollecteeFacturesCents) }
                      ];
                      downloadDailyClosePdf({
                        restaurantName: close.restaurantName,
                        fromIso: range.from.toISOString(),
                        toIso: range.to.toISOString(),
                        lines,
                        hourlyPeaks: close.heuresForteActivite.peakHourLabel
                      });
                    }}
                  >
                    PDF professionnel
                  </button>
                  <button
                    type="button"
                    className="btn-primary-ios"
                    onClick={() => {
                      const rows = [
                        ["indicateur", "valeur"],
                        ["ca_facture_eur", (close.chiffreAffairesFactureCents / 100).toFixed(2)],
                        ["commandes", close.nombreCommandesCommerce],
                        ["panier_moyen_eur", (close.panierMoyenCents / 100).toFixed(2)],
                        ["cb_eur", (close.totalCbCents / 100).toFixed(2)],
                        ["especes_eur", (close.totalEspecesCents / 100).toFixed(2)],
                        ["autre_eur", (close.totalAutresPaiementsCents / 100).toFixed(2)],
                        ["reductions_eur", (close.reductionsCents / 100).toFixed(2)],
                        ["annulations", close.annulations.count]
                      ];
                      downloadTextFile(`qrder-cloture-${preset}.csv`, rowsToCsv(rows, "semicolon"));
                    }}
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    title="Imprime le contenu de la page (onglet Clôture). Enregistrez en PDF depuis la boîte d’impression si besoin."
                    onClick={() => {
                      window.requestAnimationFrame(() => window.print());
                    }}
                  >
                    Imprimer (aperçu)
                  </button>
                </div>
              </div>
              <div className="compta-kpis">
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">CA facturé</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(close.chiffreAffairesFactureCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Commandes</p>
                  <p className="compta-kpi-value tabular-nums">{close.nombreCommandesCommerce}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Panier moyen</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(close.panierMoyenCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Pic d’activité</p>
                  <p className="compta-kpi-value">{close.heuresForteActivite.peakHourLabel}</p>
                </article>
              </div>
              <p className="acc-muted-note" style={{ marginTop: "0.5rem" }}>
                <strong>Période interrogée</strong> (réponse API) :{" "}
                {new Date(close.from).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} —{" "}
                {new Date(close.to).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}. Le CA facturé
                additionne les factures dont la date de création tombe dans cet intervalle. Si tout a été encaissé le
                même jour, « Aujourd’hui », « Cette semaine » et « Ce mois » peuvent afficher le même montant. Pour une
                clôture journalière stricte, utilise « Aujourd’hui » ou « Personnalisée » sur une seule journée.
              </p>
            </>
          )}
        </section>
      )}

      {tab === "bills" && (
        <section className="compta-bills panel">
          <div className="compta-bills-head">
            <h2 className="compta-bills-title">Factures</h2>
            <div className="acc-actions-row">
              <input
                type="search"
                className="acc-date-input"
                style={{ minWidth: "10rem", flex: "1 1 8rem" }}
                placeholder="N° ou table…"
                value={billQ}
                onChange={(e) => setBillQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setBillPage(1);
                    void loadBills();
                  }
                }}
              />
              <button type="button" className="btn-secondary" onClick={() => { setBillPage(1); void loadBills(); }}>
                Rechercher
              </button>
              <button type="button" className="btn-primary-ios" disabled={zipBusy} onClick={() => void downloadBillsZip()}>
                {zipBusy ? "ZIP…" : "ZIP PDF (max 45)"}
              </button>
            </div>
          </div>
          {!billsRes ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <p className="acc-muted-note">
                {billsRes.total} facture(s) — numérotation continue par établissement. PDF détaillé : lien « Voir ».
              </p>
              <div className="compta-table-wrap">
                <table className="compta-table">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Date</th>
                      <th>Table</th>
                      <th>HT</th>
                      <th>TVA</th>
                      <th>TTC</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {billsRes.items.map((b) => (
                      <tr key={b.id}>
                        <td className="tabular-nums">{b.invoiceNumber}</td>
                        <td>{new Date(b.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td>{b.table.name}</td>
                        <td className="tabular-nums">{(b.htCents / 100).toFixed(2)} €</td>
                        <td className="tabular-nums">{(b.tvaCents / 100).toFixed(2)} €</td>
                        <td className="tabular-nums">{(b.ttcCents / 100).toFixed(2)} €</td>
                        <td>
                          <Link href={`/dashboard/caisse/facture/${b.id}`} className="link-inline">
                            PDF / voir
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="acc-actions-row" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={billPage <= 1}
                  onClick={() => {
                    setBillPage((p) => Math.max(1, p - 1));
                  }}
                >
                  Précédent
                </button>
                <span className="muted" style={{ fontSize: "0.875rem", alignSelf: "center" }}>
                  Page {billsRes.page} / {Math.max(1, Math.ceil(billsRes.total / billsRes.pageSize))}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={billPage >= Math.ceil(billsRes.total / billsRes.pageSize)}
                  onClick={() => setBillPage((p) => p + 1)}
                >
                  Suivant
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "payments" && (
        <section className="stack">
          {!pay ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <div className="compta-kpis">
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Total encaissé</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(pay.totalEncaisseCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Pourboires</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(pay.pourboiresCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Frais processeur</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(pay.fraisStripeOuProcesseurCents)}</p>
                </article>
                <article className="compta-kpi panel">
                  <p className="compta-kpi-label muted">Net reçu</p>
                  <p className="compta-kpi-value tabular-nums">{formatEur(pay.montantNetRecuCents)}</p>
                </article>
              </div>
              {pay.stripeNote ? <p className="acc-muted-note">{pay.stripeNote}</p> : null}
              <div className="compta-bills panel">
                <h2 className="compta-bills-title">Répartition</h2>
                <div className="acc-chart-wrap acc-chart-wrap--sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--border), transparent 30%)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--card)"
                        }}
                      />
                      <Bar dataKey="montant" name="Montant (€)" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "audit" && (
        <section className="compta-bills panel">
          <div className="compta-bills-head">
            <h2 className="compta-bills-title">Journal d’audit</h2>
            <button type="button" className="btn-secondary" onClick={() => void loadAudit()}>
              Rafraîchir
            </button>
          </div>
          {!audit ? (
            <p className="muted">Chargement…</p>
          ) : audit.items.length === 0 ? (
            <p className="muted">Aucun événement sur cette période.</p>
          ) : (
            <div className="compta-table-wrap">
              <table className="compta-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Utilisateur</th>
                    <th>Action</th>
                    <th>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.items.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.createdAt).toLocaleString("fr-FR")}</td>
                      <td>{a.userEmail ?? "—"}</td>
                      <td>{a.action}</td>
                      <td style={{ maxWidth: "22rem" }}>{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "integrations" && (
        <section className="compta-bills panel">
          <h2 className="compta-bills-title">Intégrations & feuille de route</h2>
          {!integrations ? (
            <p className="muted">Chargement…</p>
          ) : integrations && typeof integrations.exports === "object" && integrations.exports != null ? (
            <div className="acc-integrations-grid">
              {Object.entries(integrations.exports as Record<string, { status?: string; label?: string; ready?: boolean }>).map(
                ([key, v]) => (
                  <div key={key} className="acc-int-card">
                    <strong>{key.toUpperCase()}</strong>
                    <span>{v.ready ? "Disponible" : v.status === "planned" ? "Prévu" : v.label ?? "—"}</span>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="muted">Aucune donnée.</p>
          )}
          <p className="acc-muted-note" style={{ marginTop: "1rem" }}>
            Architecture prévue : exports automatiques email, connecteurs Sage / Pennylane / Cegid / EBP, synchronisation
            bancaire, certification caisse (NF525 — étude réglementaire).
          </p>
        </section>
      )}
    </div>
  );
}
