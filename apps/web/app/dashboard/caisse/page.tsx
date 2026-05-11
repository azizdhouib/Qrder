"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type TableOverview = {
  tableId: string;
  tableName: string;
  unpaidOrderCount: number;
  unpaidTotalCents: number;
};

type UnpaidOrder = {
  id: string;
  orderNumber: number;
  totalCents: number;
  createdAt: string;
  items: { id: string; nameSnapshot: string; quantity: number; lineTotalCents: number }[];
};

type UnpaidPayload = {
  table: { id: string; name: string };
  orders: UnpaidOrder[];
  unpaidTotalCents: number;
};

type PaymentMethod = "CASH" | "CARD" | "OTHER";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  OTHER: "Autre"
};

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function CaissePage() {
  return (
    <main className="caisse-page">
      <TokenGate>
        {(token) => (
          <Suspense fallback={<p className="muted">Chargement de la caisse…</p>}>
            <CaisseDesk token={token} />
          </Suspense>
        )}
      </TokenGate>
    </main>
  );
}

function CaisseDesk({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const presetTableId = searchParams.get("table");
  /** Ouverture depuis le plan (Tables + QR) : une seule table, sans liste globale. */
  const focusedFromPlan = Boolean(presetTableId?.trim());

  const [overview, setOverview] = useState<TableOverview[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnpaidPayload | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payment, setPayment] = useState<PaymentMethod>("CARD");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const rows = await apiFetch<TableOverview[]>("/caisse/tables-overview", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setOverview(rows);
  }, [token]);

  const loadDetail = useCallback(
    async (tableId: string) => {
      const data = await apiFetch<UnpaidPayload>(`/caisse/tables/${encodeURIComponent(tableId)}/unpaid`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetail(data);
      setSelectedIds(new Set(data.orders.map((o) => o.id)));
      setErr(null);
    },
    [token]
  );

  const refreshDesk = useCallback(async () => {
    await loadOverview();
    if (selectedTableId) {
      try {
        await loadDetail(selectedTableId);
      } catch (e) {
        console.error(e);
      }
    }
  }, [loadOverview, loadDetail, selectedTableId]);

  useEffect(() => {
    loadOverview().catch(console.error);
  }, [loadOverview]);

  useEffect(() => {
    const id = presetTableId?.trim();
    if (!id) return;
    setSelectedTableId(id);
  }, [presetTableId]);

  useEffect(() => {
    if (!selectedTableId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedTableId).catch((e) => {
      console.error(e);
      setErr("Impossible de charger cette table.");
    });
  }, [selectedTableId, loadDetail]);

  const selectedTotal = useMemo(() => {
    if (!detail) return 0;
    return detail.orders.filter((o) => selectedIds.has(o.id)).reduce((s, o) => s + o.totalCents, 0);
  }, [detail, selectedIds]);

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function checkout() {
    if (!detail || !selectedTableId || selectedIds.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const bill = await apiFetch<{ id: string }>(`/caisse/bills`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tableId: selectedTableId,
          orderIds: [...selectedIds],
          paymentMethod: payment
        })
      });
      await loadOverview();
      if (!focusedFromPlan) {
        setSelectedTableId(null);
        setDetail(null);
      }
      window.location.href = `/dashboard/caisse/facture/${bill.id}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Encaissement impossible.";
      setErr(msg.replace(/^\[|\]$/g, "").slice(0, 280));
    } finally {
      setBusy(false);
    }
  }

  const headerTitle =
    focusedFromPlan && detail
      ? `Table ${detail.table.name}`
      : focusedFromPlan
        ? "Encaissement"
        : "Caisse";

  return (
    <div className={`caisse-stack${focusedFromPlan ? " caisse-stack--focused" : ""}`}>
      <header className={`caisse-header${focusedFromPlan ? " caisse-header--focused" : ""}`}>
        <div className="caisse-header-text">
          {focusedFromPlan ? (
            <Link href="/dashboard/tables" className="caisse-back-plan">
              ← Plan de salle
            </Link>
          ) : null}
          <p className="caisse-kicker">Encaissement</p>
          <h1 className="caisse-title">{headerTitle}</h1>
          <p className="caisse-lead muted">
            {focusedFromPlan
              ? "Notes servies en attente de paiement. Choisis le mode de règlement puis valide."
              : "Regroupe les commandes servies par table, encaisse puis imprime ou archive la facture."}
          </p>
        </div>
        <button
          type="button"
          className={focusedFromPlan ? "caisse-refresh caisse-refresh--ghost" : "caisse-refresh btn-secondary"}
          onClick={() => void refreshDesk()}
        >
          {focusedFromPlan ? "Actualiser" : "Actualiser les tables"}
        </button>
      </header>

      {err ? (
        <p className="caisse-flash caisse-flash--soft" role="alert">
          {err}
        </p>
      ) : null}

      <div className={`caisse-layout${focusedFromPlan ? " caisse-layout--single" : ""}`}>
        {!focusedFromPlan ? (
          <section className="caisse-col panel caisse-col--list">
            <h2 className="caisse-col-title">Tables à encaisser</h2>
            {overview.length === 0 ? (
              <p className="muted caisse-empty-inline">
                Aucune commande servie en attente de paiement. Tu peux aussi ouvrir une table depuis{" "}
                <Link href="/dashboard/tables">Tables + QR</Link>.
              </p>
            ) : (
              <ul className="caisse-table-list">
                {overview.map((t) => (
                  <li key={t.tableId}>
                    <button
                      type="button"
                      className={`caisse-table-row${selectedTableId === t.tableId ? " caisse-table-row--active" : ""}`}
                      onClick={() => setSelectedTableId(t.tableId)}
                    >
                      <span className="caisse-table-name">{t.tableName}</span>
                      <span className="caisse-table-meta muted">
                        {t.unpaidOrderCount} note{t.unpaidOrderCount > 1 ? "s" : ""}
                      </span>
                      <span className="caisse-table-total tabular-nums">{formatEur(t.unpaidTotalCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="caisse-hint muted">
              La <Link href="/dashboard/compta">compta</Link> utilise uniquement les encaissements enregistrés ici. Logo
              et mentions légales : <Link href="/dashboard/facturation">Facturation</Link>.
            </p>
          </section>
        ) : null}

        <section
          className={`caisse-col${focusedFromPlan ? " caisse-sheet caisse-sheet--focused" : " panel"}`}
        >
          {!selectedTableId ? (
            <p className="muted caisse-placeholder">Sélectionne une table{focusedFromPlan ? "" : " à gauche"}.</p>
          ) : !detail ? (
            <p className="muted caisse-placeholder">Chargement…</p>
          ) : detail.orders.length === 0 ? (
            <div className="caisse-empty-sheet">
              <p className="caisse-empty-title">Rien à encaisser</p>
              <p className="muted caisse-empty-copy">
                Aucune note servie en attente pour cette table. Retourne au plan ou actualise si une commande vient d’être
                servie.
              </p>
              <Link href="/dashboard/tables" className="caisse-empty-cta">
                Retour au plan de salle
              </Link>
            </div>
          ) : focusedFromPlan ? (
            <>
              <div className="caisse-sheet-body caisse-sheet-body--focused">
                <div className="caisse-sheet-total-slot">
                  <p className="caisse-sheet-eyebrow muted">Total sélectionné</p>
                  <p className="caisse-sheet-total tabular-nums">{formatEur(selectedTotal)}</p>
                </div>
                <ul className="caisse-order-pick caisse-order-pick--focused">
                  {detail.orders.map((o) => {
                    const on = selectedIds.has(o.id);
                    return (
                      <li key={o.id}>
                        <label className={`caisse-order-label${on ? " caisse-order-label--on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleOrder(o.id)}
                            className="caisse-order-cb"
                          />
                          <span className="caisse-order-body">
                            <span className="caisse-order-head">
                              <span className="caisse-order-num">Commande #{o.orderNumber}</span>
                              <span className="caisse-order-price tabular-nums">{formatEur(o.totalCents)}</span>
                            </span>
                            <ul className="caisse-order-lines">
                              {o.items.map((it) => (
                                <li key={it.id}>
                                  <span className="tabular-nums">{it.quantity}×</span> {it.nameSnapshot}
                                </li>
                              ))}
                            </ul>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="caisse-sheet-actions">
                  <label className="caisse-pay-label">
                    <span className="caisse-pay-field-label">Paiement</span>
                    <select
                      className="caisse-pay-select"
                      value={payment}
                      onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                    >
                      {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((k) => (
                        <option key={k} value={k}>
                          {PAYMENT_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="caisse-checkout-btn"
                    disabled={busy || selectedIds.size === 0}
                    onClick={() => void checkout()}
                  >
                    {busy ? "Encaissement…" : "Encaisser et facture"}
                  </button>
                </div>
              </div>
              <p className="caisse-sheet-foot muted">
                <Link href="/dashboard/compta">Compta</Link>
                <span className="caisse-sheet-foot-sep" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
                <Link href="/dashboard/facturation">Facturation</Link>
              </p>
            </>
          ) : (
            <>
              <div className="caisse-sheet-head">
                <h2 className="caisse-col-title">
                  {detail.table.name}
                  <span className="caisse-col-sub muted"> — total sélection {formatEur(selectedTotal)}</span>
                </h2>
              </div>
              <ul className="caisse-order-pick">
                {detail.orders.map((o) => {
                  const on = selectedIds.has(o.id);
                  return (
                    <li key={o.id}>
                      <label className={`caisse-order-label${on ? " caisse-order-label--on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleOrder(o.id)}
                          className="caisse-order-cb"
                        />
                        <span className="caisse-order-body">
                          <span className="caisse-order-head">
                            <span className="caisse-order-num">Commande #{o.orderNumber}</span>
                            <span className="caisse-order-price tabular-nums">{formatEur(o.totalCents)}</span>
                          </span>
                          <ul className="caisse-order-lines">
                            {o.items.map((it) => (
                              <li key={it.id}>
                                <span className="tabular-nums">{it.quantity}×</span> {it.nameSnapshot}
                              </li>
                            ))}
                          </ul>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="caisse-pay-row">
                <label className="caisse-pay-label">
                  <span className="caisse-pay-field-label">Paiement</span>
                  <select
                    className="caisse-pay-select"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                  >
                    {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((k) => (
                      <option key={k} value={k}>
                        {PAYMENT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="caisse-checkout-btn"
                  disabled={busy || selectedIds.size === 0}
                  onClick={() => void checkout()}
                >
                  {busy ? "Encaissement…" : "Encaisser et facture"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
