import type { RestaurantVatMode } from "@prisma/client";

/** Ventilation HT / TVA à partir d’un montant TTC (prix catalogue TTC, France). */
export function splitVatFromTtcCents(ttcCents: number, mode: RestaurantVatMode): {
  netHtCents: number;
  tvaCents: number;
  vatRatePercent: number | null;
} {
  const ttc = Math.max(0, Math.round(ttcCents));
  if (mode === "VAT_EXEMPT_ART293B") {
    return { netHtCents: ttc, tvaCents: 0, vatRatePercent: null };
  }
  const rate = mode === "TTC_FR_20" ? 0.2 : mode === "TTC_FR_55" ? 0.055 : 0.1;
  const netHtCents = Math.round(ttc / (1 + rate));
  const tvaCents = Math.max(0, ttc - netHtCents);
  return { netHtCents, tvaCents, vatRatePercent: rate * 100 };
}
