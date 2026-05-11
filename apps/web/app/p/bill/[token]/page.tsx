"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { InvoiceToolbar } from "@/components/invoice/InvoiceToolbar";
import type { InvoiceBillPayload } from "@/lib/invoiceTypes";
import type { InvoiceLocale } from "@/lib/invoiceI18n";
import type { InvoiceVariant } from "@/components/invoice/InvoiceDocument";
import { normalizeBillPayload } from "@/lib/invoiceNormalize";

export default function PublicBillPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : params.token?.[0] ?? "";
  const [bill, setBill] = useState<InvoiceBillPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locale, setLocale] = useState<InvoiceLocale>("fr");
  const [variant, setVariant] = useState<InvoiceVariant>("a4");
  const [printClass, setPrintClass] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/public/bills/${encodeURIComponent(token)}`);
      setBill(normalizeBillPayload(raw));
      setErr(null);
    } catch (e) {
      setBill(null);
      setErr(e instanceof Error ? e.message : "Lien invalide.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const publicBillUrl = useMemo(() => {
    if (typeof window === "undefined" || !token) return "";
    return `${window.location.origin}/p/bill/${token}`;
  }, [token]);

  const handlePrint = useCallback((cls: "inv-print-a4" | "inv-print-thermal") => {
    setPrintClass(cls);
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => setPrintClass(null), 800);
    });
  }, []);

  return (
    <main className="invoice-page public-bill-page">
      <div className="no-print invoice-toolbar public-bill-toolbar">
        <span className="muted" style={{ fontWeight: 600 }}>
          Qrder — consultation facture
        </span>
        {bill ? (
          <InvoiceToolbar
            locale={locale}
            onLocaleChange={setLocale}
            variant={variant}
            onVariantChange={setVariant}
            onPrint={handlePrint}
            fileBaseName={`facture-${bill.invoiceNumber}`}
          />
        ) : null}
      </div>

      {err ? (
        <p className="panel" style={{ maxWidth: 480, margin: "2rem auto" }} role="alert">
          {err}
        </p>
      ) : !bill ? (
        <p className="muted" style={{ textAlign: "center", marginTop: "3rem" }}>
          Chargement…
        </p>
      ) : (
        <div className="invoice-preview-wrap">
          <InvoiceDocument
            bill={bill}
            locale={locale}
            variant={variant}
            publicBillUrl={publicBillUrl}
            printClass={printClass}
          />
        </div>
      )}
    </main>
  );
}
