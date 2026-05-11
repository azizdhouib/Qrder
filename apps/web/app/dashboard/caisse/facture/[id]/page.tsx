"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { InvoiceToolbar } from "@/components/invoice/InvoiceToolbar";
import type { InvoiceBillPayload } from "@/lib/invoiceTypes";
import type { InvoiceLocale } from "@/lib/invoiceI18n";
import type { InvoiceVariant } from "@/components/invoice/InvoiceDocument";
import { normalizeBillPayload } from "@/lib/invoiceNormalize";

export default function FacturePage() {
  return (
    <main className="invoice-page invoice-page--dashboard">
      <TokenGate>{(token) => <FactureBody token={token} />}</TokenGate>
    </main>
  );
}

function FactureBody({ token }: { token: string }) {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const [bill, setBill] = useState<InvoiceBillPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locale, setLocale] = useState<InvoiceLocale>("fr");
  const [variant, setVariant] = useState<InvoiceVariant>("a4");
  const [printClass, setPrintClass] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const raw = await apiFetch<Record<string, unknown>>(`/caisse/bills/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBill(normalizeBillPayload(raw));
      setErr(null);
    } catch (e) {
      setBill(null);
      setErr(e instanceof Error ? e.message : "Facture introuvable.");
    }
  }, [id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const publicBillUrl = useMemo(() => {
    if (typeof window === "undefined" || !bill?.publicViewToken) return "";
    return `${window.location.origin}/p/bill/${bill.publicViewToken}`;
  }, [bill?.publicViewToken]);

  const handlePrint = useCallback((cls: "inv-print-a4" | "inv-print-thermal") => {
    setPrintClass(cls);
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => setPrintClass(null), 800);
    });
  }, []);

  return (
    <>
      <div className="no-print invoice-toolbar">
        <Link href="/dashboard/caisse" className="btn-secondary">
          ← Caisse
        </Link>
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
        <p className="panel" role="alert">
          {err}
        </p>
      ) : !bill ? (
        <p className="muted">Chargement…</p>
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
    </>
  );
}
