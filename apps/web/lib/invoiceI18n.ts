export type InvoiceLocale = "fr" | "en";

type Dict = Record<string, string>;

const FR: Dict = {
  docTitle: "Facture",
  ticketTitle: "Ticket de caisse",
  paid: "Payé",
  pending: "En attente",
  cancelled: "Annulé",
  invoiceNo: "N° facture",
  ticketNo: "N° ticket caisse",
  transactionRef: "Réf. transaction",
  table: "Table",
  covers: "Couverts",
  customer: "Client",
  payment: "Paiement",
  server: "Caissier / serveur",
  date: "Date & heure",
  order: "Commande",
  product: "Article",
  qty: "Qté",
  unit: "P.U.",
  lineTotal: "Total",
  options: "Options",
  note: "Note",
  subtotalHt: "Sous-total HT",
  vatDetail: "TVA",
  totalTva: "Total TVA",
  discount: "Remises",
  serviceFee: "Frais de service",
  totalTtc: "Total TTC",
  amountPaid: "Montant payé",
  balanceDue: "Reste dû",
  legalMention293b: "TVA non applicable, art. 293 B du CGI.",
  legalAutoFooter:
    "Conservez ce document pour votre comptabilité. Pour toute réclamation, contactez l’établissement dans les 48 h.",
  scanQr: "Consulter en ligne",
  powered: "Document Qrder",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
  emailSoon: "Envoi par e-mail — bientôt disponible"
};

const EN: Dict = {
  docTitle: "Invoice",
  ticketTitle: "Receipt",
  paid: "Paid",
  pending: "Pending",
  cancelled: "Cancelled",
  invoiceNo: "Invoice #",
  ticketNo: "Receipt #",
  transactionRef: "Transaction ref.",
  table: "Table",
  covers: "Covers",
  customer: "Guest",
  payment: "Payment",
  server: "Cashier / server",
  date: "Date & time",
  order: "Order",
  product: "Item",
  qty: "Qty",
  unit: "Unit",
  lineTotal: "Total",
  options: "Options",
  note: "Note",
  subtotalHt: "Subtotal excl. VAT",
  vatDetail: "VAT",
  totalTva: "Total VAT",
  discount: "Discounts",
  serviceFee: "Service charge",
  totalTtc: "Total incl. VAT",
  amountPaid: "Amount paid",
  balanceDue: "Balance due",
  legalMention293b: "VAT not applicable — French micro-business regime (art. 293 B CGI).",
  legalAutoFooter: "Keep this document for your records. For any claim, contact the venue within 48 hours.",
  scanQr: "View online",
  powered: "Qrder document",
  cash: "Cash",
  card: "Card",
  other: "Other",
  emailSoon: "Email receipt — coming soon"
};

export function invoiceT(locale: InvoiceLocale, key: keyof typeof FR): string {
  const d = locale === "en" ? EN : FR;
  return d[key] ?? key;
}

export function paymentLabel(locale: InvoiceLocale, method: string): string {
  if (method === "CASH") return invoiceT(locale, "cash");
  if (method === "CARD") return invoiceT(locale, "card");
  return invoiceT(locale, "other");
}
