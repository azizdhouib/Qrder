import type { InvoiceVatMode } from "@/lib/invoiceTypes";

export type VatSplit = {
  subtotalTtcCents: number;
  discountCents: number;
  serviceFeeCents: number;
  /** Montant hors TVA (arrondi entier centimes). */
  netHtCents: number;
  /** TVA totale estimée. */
  tvaCents: number;
  /** TTC après remise / frais (doit coïncider avec total facture). */
  totalTtcCents: number;
  vatRatePercent: number | null;
  mode: InvoiceVatMode;
};

function roundMoney(n: number): number {
  return Math.round(n);
}

/**
 * Ventilation TVA à partir du total TTC facture (prix catalogue TTC).
 * Un seul taux documentaire selon `vatMode` (usage restauration France).
 */
export function splitVatFromBill(
  totalTtcCents: number,
  discountCents: number,
  serviceFeeCents: number,
  vatMode: InvoiceVatMode
): VatSplit {
  const disc = Math.max(0, discountCents);
  const fee = Math.max(0, serviceFeeCents);
  const subtotalTtcCents = totalTtcCents + disc - fee;

  if (vatMode === "VAT_EXEMPT_ART293B") {
    return {
      subtotalTtcCents,
      discountCents: disc,
      serviceFeeCents: fee,
      netHtCents: totalTtcCents,
      tvaCents: 0,
      totalTtcCents,
      vatRatePercent: null,
      mode: vatMode
    };
  }

  const rate = vatMode === "TTC_FR_20" ? 0.2 : vatMode === "TTC_FR_55" ? 0.055 : 0.1;
  const ttcAfter = totalTtcCents;
  const netHtCents = roundMoney(ttcAfter / (1 + rate));
  const tvaCents = Math.max(0, ttcAfter - netHtCents);

  return {
    subtotalTtcCents,
    discountCents: disc,
    serviceFeeCents: fee,
    netHtCents,
    tvaCents,
    totalTtcCents: ttcAfter,
    vatRatePercent: rate * 100,
    mode: vatMode
  };
}
