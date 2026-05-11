"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { InvoiceBillPayload } from "@/lib/invoiceTypes";
import { splitVatFromBill } from "@/lib/invoiceMath";
import { invoiceT, paymentLabel, type InvoiceLocale } from "@/lib/invoiceI18n";
import "./invoice-print.css";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR" }).format(cents / 100);
}

function formatAddress(r: InvoiceBillPayload["restaurant"]): string {
  const parts = [
    r.addressLine1,
    r.addressLine2,
    [r.postalCode, r.city].filter(Boolean).join(" "),
    r.country && r.country !== "FR" ? r.country : null
  ].filter(Boolean);
  return parts.join("\n");
}

export type InvoiceVariant = "a4" | "thermal";

export function InvoiceDocument({
  bill,
  locale,
  variant,
  publicBillUrl,
  printClass
}: {
  bill: InvoiceBillPayload;
  locale: InvoiceLocale;
  variant: InvoiceVariant;
  publicBillUrl: string;
  /** Classe supplémentaire pour @page (ex. inv-print-a4 | inv-print-thermal) au moment d’imprimer */
  printClass?: string | null;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!publicBillUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(publicBillUrl, { width: variant === "thermal" ? 200 : 240, margin: 1, color: { dark: "#0c0c0f", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicBillUrl, variant]);

  const vat = useMemo(
    () => splitVatFromBill(bill.totalCents, bill.discountCents, bill.serviceFeeCents, bill.restaurant.vatMode),
    [bill]
  );

  const articlesTtc = useMemo(() => bill.orders.reduce((s, o) => s + o.totalCents, 0), [bill.orders]);

  const displayName = bill.restaurant.legalName?.trim() || bill.restaurant.name;
  const tradeName = bill.restaurant.legalName?.trim() ? bill.restaurant.name : null;

  const cashier = bill.registeredByLabel?.trim() || bill.registeredBy?.email || "—";

  const coversDisplay = bill.orders.map((o) => o.covers).find((c) => c != null && c > 0);
  const customerDisplay = bill.orders.map((o) => o.customerName?.trim()).find(Boolean);

  const invNo = `INV-${String(bill.invoiceNumber).padStart(6, "0")}`;
  const ticketNo = `TC-${String(bill.invoiceNumber).padStart(6, "0")}`;

  const rootClass = [
    "inv-root",
    variant === "thermal" ? "inv-root--thermal" : "inv-root--a4",
    printClass === "inv-print-thermal" ? "inv-print-thermal" : "",
    printClass === "inv-print-a4" ? "inv-print-a4" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article id="invoice-export-root" className={rootClass}>
      <header className="inv-top">
        <div className="inv-brand-row">
          {bill.restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bill.restaurant.logoUrl} alt="" className="inv-logo" crossOrigin="anonymous" />
          ) : (
            <div className="inv-logo" aria-hidden style={{ display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.75rem" }}>
              {bill.restaurant.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="inv-brand-text">
            <h1 className="inv-legal-name">{displayName}</h1>
            {tradeName ? <p className="inv-trade-name">{tradeName}</p> : null}
            <p className="inv-address">{formatAddress(bill.restaurant)}</p>
            <p className="inv-address" style={{ marginTop: "0.35rem" }}>
              {[bill.restaurant.phone, bill.restaurant.billingEmail].filter(Boolean).join(" · ")}
            </p>
            <p className="inv-address" style={{ marginTop: "0.35rem" }}>
              {[bill.restaurant.siret ? `SIRET ${bill.restaurant.siret}` : null, bill.restaurant.vatNumber ? `TVA ${bill.restaurant.vatNumber}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="inv-meta-right">
          <div>
            <strong>{invoiceT(locale, "invoiceNo")}</strong> {invNo}
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong>{invoiceT(locale, "ticketNo")}</strong> {ticketNo}
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong>{invoiceT(locale, "transactionRef")}</strong> {bill.paymentReference}
          </div>
          <div style={{ marginTop: "0.35rem" }}>{new Date(bill.createdAt).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")}</div>
        </div>
      </header>

      <div className="inv-badges">
        <span className="inv-badge inv-badge--paid">{invoiceT(locale, "paid")}</span>
        <span className="inv-badge inv-badge--muted">
          {bill.restaurant.vatMode === "VAT_EXEMPT_ART293B"
            ? "TVA — art. 293 B"
            : `TVA ${vat.vatRatePercent}%`}
        </span>
      </div>

      <div className="inv-grid">
        <div>
          <div className="inv-k">{invoiceT(locale, "table")}</div>
          <div className="inv-v">{bill.table.name}</div>
        </div>
        <div>
          <div className="inv-k">{invoiceT(locale, "payment")}</div>
          <div className="inv-v">{paymentLabel(locale, bill.paymentMethod)}</div>
        </div>
        <div>
          <div className="inv-k">{invoiceT(locale, "covers")}</div>
          <div className="inv-v">{coversDisplay ?? "—"}</div>
        </div>
        <div>
          <div className="inv-k">{invoiceT(locale, "customer")}</div>
          <div className="inv-v">{customerDisplay ?? "—"}</div>
        </div>
        <div style={{ gridColumn: variant === "thermal" ? "1" : "1 / -1" }}>
          <div className="inv-k">{invoiceT(locale, "server")}</div>
          <div className="inv-v">{cashier}</div>
        </div>
      </div>

      <div className="inv-sep" />

      {bill.orders.map((order) => (
        <section key={order.id} className="inv-order-block">
          <div className="inv-order-head">
            <strong>
              {invoiceT(locale, "order")} #{order.orderNumber}
            </strong>
            <span className="tabular-nums" style={{ fontWeight: 800 }}>
              {formatMoney(order.totalCents, bill.restaurant.currency)}
            </span>
          </div>
          {order.notes?.trim() ? (
            <p className="inv-order-note">
              <strong>{invoiceT(locale, "note")} : </strong>
              {order.notes.trim()}
            </p>
          ) : null}
          <table className="inv-lines">
            <thead>
              <tr>
                <th>{invoiceT(locale, "product")}</th>
                <th className="inv-num">{invoiceT(locale, "qty")}</th>
                <th className="inv-num">{invoiceT(locale, "unit")}</th>
                <th className="inv-num">{invoiceT(locale, "lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.nameSnapshot}
                    {it.options?.length ? (
                      <span className="inv-opt">
                        {invoiceT(locale, "options")}: {it.options.map((o) => o.nameSnapshot).join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="inv-num">{it.quantity}</td>
                  <td className="inv-num">{formatMoney(it.unitPriceCents, bill.restaurant.currency)}</td>
                  <td className="inv-num">{formatMoney(it.lineTotalCents, bill.restaurant.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <div className="inv-sep" />

      <div className="inv-totals">
        <div className="inv-total-row">
          <span className="inv-muted">{locale === "en" ? "Articles (incl. VAT)" : "Articles (TTC)"}</span>
          <span className="tabular-nums">{formatMoney(articlesTtc, bill.restaurant.currency)}</span>
        </div>
        {bill.discountCents > 0 ? (
          <div className="inv-total-row">
            <span className="inv-muted">{invoiceT(locale, "discount")}</span>
            <span className="tabular-nums">−{formatMoney(bill.discountCents, bill.restaurant.currency)}</span>
          </div>
        ) : null}
        {bill.serviceFeeCents > 0 ? (
          <div className="inv-total-row">
            <span className="inv-muted">{invoiceT(locale, "serviceFee")}</span>
            <span className="tabular-nums">+{formatMoney(bill.serviceFeeCents, bill.restaurant.currency)}</span>
          </div>
        ) : null}
        {bill.restaurant.vatMode !== "VAT_EXEMPT_ART293B" ? (
          <>
            <div className="inv-total-row" style={{ marginTop: "0.5rem" }}>
              <span className="inv-muted">{invoiceT(locale, "subtotalHt")}</span>
              <span className="tabular-nums">{formatMoney(vat.netHtCents, bill.restaurant.currency)}</span>
            </div>
            <div className="inv-total-row">
              <span className="inv-muted">
                {invoiceT(locale, "vatDetail")}
                {vat.vatRatePercent != null ? ` (${vat.vatRatePercent}%)` : ""}
              </span>
              <span className="tabular-nums">{formatMoney(vat.tvaCents, bill.restaurant.currency)}</span>
            </div>
          </>
        ) : (
          <div className="inv-total-row" style={{ marginTop: "0.5rem" }}>
            <span className="inv-muted">{invoiceT(locale, "legalMention293b")}</span>
            <span />
          </div>
        )}
        <div className="inv-total-row inv-total-row--emph">
          <span>{invoiceT(locale, "totalTtc")}</span>
          <span className="tabular-nums">{formatMoney(bill.totalCents, bill.restaurant.currency)}</span>
        </div>
        <div className="inv-total-row">
          <span className="inv-muted">{invoiceT(locale, "amountPaid")}</span>
          <span className="tabular-nums">{formatMoney(bill.totalCents, bill.restaurant.currency)}</span>
        </div>
        <div className="inv-total-row">
          <span className="inv-muted">{invoiceT(locale, "balanceDue")}</span>
          <span className="tabular-nums">{formatMoney(0, bill.restaurant.currency)}</span>
        </div>
      </div>

      <div className="inv-legal">
        {bill.restaurant.invoiceFooterLegal?.trim() ? (
          <p style={{ margin: "0 0 0.5rem", whiteSpace: "pre-line" }}>{bill.restaurant.invoiceFooterLegal.trim()}</p>
        ) : null}
        {bill.restaurant.vatMode === "VAT_EXEMPT_ART293B" ? (
          <p style={{ margin: "0 0 0.5rem" }}>{invoiceT(locale, "legalMention293b")}</p>
        ) : null}
        <p style={{ margin: 0 }}>{invoiceT(locale, "legalAutoFooter")}</p>
      </div>

      <footer className="inv-footer">
        <div>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{invoiceT(locale, "scanQr")}</div>
          <div style={{ wordBreak: "break-all", fontSize: "0.68rem" }}>{publicBillUrl || "—"}</div>
          <div style={{ marginTop: "0.35rem", fontWeight: 600 }}>{invoiceT(locale, "powered")}</div>
        </div>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="" className="inv-qr" />
        ) : (
          <div className="inv-qr" aria-hidden />
        )}
      </footer>
    </article>
  );
}
