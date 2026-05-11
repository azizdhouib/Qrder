import type { InvoiceBillPayload, InvoiceVatMode } from "@/lib/invoiceTypes";

export function normalizeBillPayload(raw: Record<string, unknown>): InvoiceBillPayload {
  const r = raw.restaurant as Record<string, unknown>;
  const vatMode = (r.vatMode as InvoiceVatMode) || "TTC_FR_10";
  return {
    id: String(raw.id),
    invoiceNumber: Number(raw.invoiceNumber),
    totalCents: Number(raw.totalCents),
    paymentMethod: raw.paymentMethod as InvoiceBillPayload["paymentMethod"],
    createdAt: String(raw.createdAt),
    paymentReference: String(raw.paymentReference ?? ""),
    publicViewToken: String(raw.publicViewToken ?? ""),
    registeredByLabel: raw.registeredByLabel != null ? String(raw.registeredByLabel) : null,
    discountCents: Number(raw.discountCents ?? 0),
    serviceFeeCents: Number(raw.serviceFeeCents ?? 0),
    table: raw.table as InvoiceBillPayload["table"],
    registeredBy: raw.registeredBy as InvoiceBillPayload["registeredBy"],
    orders: (raw.orders as InvoiceBillPayload["orders"]).map((o) => ({
      ...o,
      notes: o.notes ?? null,
      customerName: o.customerName ?? null,
      covers: o.covers ?? null,
      items: o.items.map((it) => ({
        ...it,
        options: it.options ?? []
      }))
    })),
    restaurant: {
      name: String(r.name),
      slug: String(r.slug ?? ""),
      currency: String(r.currency ?? "EUR"),
      legalName: r.legalName != null ? String(r.legalName) : null,
      addressLine1: r.addressLine1 != null ? String(r.addressLine1) : null,
      addressLine2: r.addressLine2 != null ? String(r.addressLine2) : null,
      postalCode: r.postalCode != null ? String(r.postalCode) : null,
      city: r.city != null ? String(r.city) : null,
      country: r.country != null ? String(r.country) : null,
      phone: r.phone != null ? String(r.phone) : null,
      billingEmail: r.billingEmail != null ? String(r.billingEmail) : null,
      siret: r.siret != null ? String(r.siret) : null,
      vatNumber: r.vatNumber != null ? String(r.vatNumber) : null,
      logoUrl: r.logoUrl != null ? String(r.logoUrl) : null,
      invoiceFooterLegal: r.invoiceFooterLegal != null ? String(r.invoiceFooterLegal) : null,
      vatMode
    }
  };
}
