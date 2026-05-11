/** Aligné sur la réponse API `GET /caisse/bills/:id` et `GET /public/bills/:token`. */

export type InvoiceVatMode = "TTC_FR_10" | "TTC_FR_20" | "TTC_FR_55" | "VAT_EXEMPT_ART293B";

export type InvoicePaymentMethod = "CASH" | "CARD" | "OTHER";

export type InvoiceRestaurant = {
  name: string;
  slug: string;
  currency: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  billingEmail: string | null;
  siret: string | null;
  vatNumber: string | null;
  logoUrl: string | null;
  invoiceFooterLegal: string | null;
  vatMode: InvoiceVatMode;
};

export type InvoiceOrderItemOpt = { nameSnapshot: string; priceDeltaCents: number };

export type InvoiceOrderItem = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  options: InvoiceOrderItemOpt[];
};

export type InvoiceOrder = {
  id: string;
  orderNumber: number;
  totalCents: number;
  notes: string | null;
  customerName: string | null;
  covers: number | null;
  items: InvoiceOrderItem[];
};

export type InvoiceBillPayload = {
  id: string;
  invoiceNumber: number;
  totalCents: number;
  paymentMethod: InvoicePaymentMethod;
  createdAt: string;
  paymentReference: string;
  publicViewToken: string;
  registeredByLabel: string | null;
  discountCents: number;
  serviceFeeCents: number;
  table: { id: string; name: string };
  restaurant: InvoiceRestaurant;
  registeredBy: { email: string } | null;
  orders: InvoiceOrder[];
};
