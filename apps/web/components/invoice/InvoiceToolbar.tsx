"use client";

import { useCallback, useState } from "react";
import { exportInvoiceElementToPdf } from "@/lib/invoicePdf";
import type { InvoiceLocale } from "@/lib/invoiceI18n";
import { invoiceT } from "@/lib/invoiceI18n";
import type { InvoiceVariant } from "@/components/invoice/InvoiceDocument";

export function InvoiceToolbar({
  locale,
  onLocaleChange,
  variant,
  onVariantChange,
  onPrint,
  fileBaseName
}: {
  locale: InvoiceLocale;
  onLocaleChange: (l: InvoiceLocale) => void;
  variant: InvoiceVariant;
  onVariantChange: (v: InvoiceVariant) => void;
  onPrint: (printClass: "inv-print-a4" | "inv-print-thermal") => void;
  fileBaseName: string;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadPdf = useCallback(async () => {
    const el = document.getElementById("invoice-export-root");
    if (!el) return;
    setPdfBusy(true);
    try {
      await exportInvoiceElementToPdf(el as HTMLElement, {
        variant: variant === "thermal" ? "thermal" : "a4",
        fileName: `${fileBaseName}-${variant}`
      });
    } catch (e) {
      console.error(e);
    } finally {
      setPdfBusy(false);
    }
  }, [fileBaseName, variant]);

  return (
    <div className="invoice-toolbar-inner no-print">
      <div className="invoice-toolbar-group">
        <span className="invoice-toolbar-label muted">{locale === "en" ? "Format" : "Format"}</span>
        <div className="invoice-toolbar-seg" role="group">
          <button
            type="button"
            className={`invoice-toolbar-seg-btn${variant === "a4" ? " invoice-toolbar-seg-btn--on" : ""}`}
            onClick={() => onVariantChange("a4")}
          >
            A4
          </button>
          <button
            type="button"
            className={`invoice-toolbar-seg-btn${variant === "thermal" ? " invoice-toolbar-seg-btn--on" : ""}`}
            onClick={() => onVariantChange("thermal")}
          >
            80 mm
          </button>
        </div>
      </div>
      <div className="invoice-toolbar-group">
        <span className="invoice-toolbar-label muted">Lang</span>
        <div className="invoice-toolbar-seg" role="group">
          <button
            type="button"
            className={`invoice-toolbar-seg-btn${locale === "fr" ? " invoice-toolbar-seg-btn--on" : ""}`}
            onClick={() => onLocaleChange("fr")}
          >
            FR
          </button>
          <button
            type="button"
            className={`invoice-toolbar-seg-btn${locale === "en" ? " invoice-toolbar-seg-btn--on" : ""}`}
            onClick={() => onLocaleChange("en")}
          >
            EN
          </button>
        </div>
      </div>
      <div className="invoice-toolbar-spacer" />
      <button type="button" className="btn-secondary" disabled={pdfBusy} onClick={() => void downloadPdf()}>
        {pdfBusy ? "…" : locale === "en" ? "Download PDF" : "Télécharger PDF"}
      </button>
      <button type="button" className="btn-secondary" onClick={() => onPrint(variant === "thermal" ? "inv-print-thermal" : "inv-print-a4")}>
        {locale === "en" ? "Print" : "Imprimer"}
      </button>
      <button type="button" className="btn-secondary" disabled title={invoiceT(locale, "emailSoon")}>
        {locale === "en" ? "Email" : "E-mail"}
      </button>
    </div>
  );
}
