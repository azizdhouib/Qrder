import { Router } from "express";
import type { Request, Response } from "express";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { db } from "../db.js";
import { authRequired, requireRoles } from "../auth.js";
import { splitVatFromTtcCents } from "./vatMath.js";

const staffOnly = requireRoles("OWNER", "MANAGER");

function parseRange(req: Request): { from: Date; to: Date } | null {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
  const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!fromRaw || !toRaw) return null;
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  return { from, to };
}

const FULFILLMENT_FR: Record<string, string> = {
  DINE_IN: "Sur place",
  TAKEAWAY: "À emporter",
  DELIVERY: "Livraison"
};

const PAYMENT_FR: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  CARD: "Carte bancaire",
  OTHER: "Autre"
};

function paymentStatusForOrder(status: OrderStatus, billId: string | null): string {
  if (status === OrderStatus.CANCELLED) return "Annulé";
  if (billId) return "Encaissé";
  return "Non encaissé";
}

export function createAccountingRouter() {
  const r = Router();
  r.use(authRequired, staffOnly);

  /** Lignes ventes pour export CSV / Excel (colonnes comptables France). */
  r.get("/sales-lines", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const restaurant = await db.restaurant.findUnique({
      where: { id: rid },
      select: { vatMode: true, name: true }
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant introuvable" });

    const orders = await db.order.findMany({
      where: { restaurantId: rid, createdAt: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        totalCents: true,
        customerName: true,
        fulfillmentType: true,
        billId: true,
        bill: {
          select: {
            invoiceNumber: true,
            paymentMethod: true,
            createdAt: true,
            registeredByLabel: true
          }
        },
        table: { select: { name: true } }
      },
      orderBy: { createdAt: "asc" },
      take: 10_000
    });

    const rows = orders.map((o) => {
      const { netHtCents, tvaCents, vatRatePercent } = splitVatFromTtcCents(o.totalCents, restaurant.vatMode);
      const d = new Date(o.createdAt);
      return {
        date: d.toLocaleDateString("fr-FR"),
        heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        restaurant: restaurant.name,
        numeroCommande: o.orderNumber,
        numeroFacture: o.bill?.invoiceNumber ?? null,
        table: o.table.name,
        typeCommande: FULFILLMENT_FR[o.fulfillmentType] ?? o.fulfillmentType,
        montantHtCentimes: netHtCents,
        tvaCentimes: tvaCents,
        tauxTvaPercent: vatRatePercent,
        montantTtcCentimes: o.totalCents,
        moyenPaiement: o.bill ? PAYMENT_FR[o.bill.paymentMethod] ?? o.bill.paymentMethod : "",
        statutPaiement: paymentStatusForOrder(o.status, o.billId),
        serveur: o.bill?.registeredByLabel ?? "",
        client: o.customerName ?? ""
      };
    });

    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      computedAt: new Date().toISOString(),
      vatMode: restaurant.vatMode,
      rows
    });
  });

  /** Rapport TVA agrégé (buckets 10 % / 20 % / 5,5 % / exonéré). */
  r.get("/vat-report", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const restaurant = await db.restaurant.findUnique({
      where: { id: rid },
      select: { vatMode: true, name: true }
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant introuvable" });

    const bills = await db.bill.findMany({
      where: { restaurantId: rid, createdAt: { gte: range.from, lte: range.to } },
      select: { totalCents: true }
    });

    const buckets = {
      rate10: { label: "TVA 10 %", htCents: 0, tvaCents: 0, ttcCents: 0 },
      rate20: { label: "TVA 20 %", htCents: 0, tvaCents: 0, ttcCents: 0 },
      rate55: { label: "TVA 5,5 %", htCents: 0, tvaCents: 0, ttcCents: 0 },
      exempt: { label: "Exonéré (art. 293 B)", htCents: 0, tvaCents: 0, ttcCents: 0 }
    };

    let totalHt = 0;
    let totalTva = 0;
    let totalTtc = 0;

    for (const b of bills) {
      const ttc = b.totalCents;
      const { netHtCents, tvaCents } = splitVatFromTtcCents(ttc, restaurant.vatMode);
      totalHt += netHtCents;
      totalTva += tvaCents;
      totalTtc += ttc;
      const key =
        restaurant.vatMode === "VAT_EXEMPT_ART293B"
          ? "exempt"
          : restaurant.vatMode === "TTC_FR_20"
            ? "rate20"
            : restaurant.vatMode === "TTC_FR_55"
              ? "rate55"
              : "rate10";
      const slot = buckets[key as keyof typeof buckets];
      slot.htCents += netHtCents;
      slot.tvaCents += tvaCents;
      slot.ttcCents += ttc;
    }

    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      computedAt: new Date().toISOString(),
      restaurantName: restaurant.name,
      restaurantVatMode: restaurant.vatMode,
      note:
        "Les ventes sont ventilées selon le mode TVA actuel de l’établissement. Pour une traçabilité historique multi-taux par facture, une évolution du modèle pourra stocker le taux au moment de l’encaissement (exports Sage / Pennylane).",
      totals: { htCents: totalHt, tvaCents: totalTva, ttcCents: totalTtc },
      buckets
    });
  });

  /** Clôture / rapport journalier (période courte : typ. une journée). */
  r.get("/daily-close", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const restaurant = await db.restaurant.findUnique({ where: { id: rid }, select: { vatMode: true, name: true } });
    if (!restaurant) return res.status(404).json({ message: "Restaurant introuvable" });

    const [bills, ordersInRange, cancelledInRange] = await Promise.all([
      db.bill.findMany({
        where: { restaurantId: rid, createdAt: { gte: range.from, lte: range.to } },
        select: {
          totalCents: true,
          paymentMethod: true,
          discountCents: true,
          tipCents: true,
          processorFeeCents: true
        }
      }),
      db.order.findMany({
        where: {
          restaurantId: rid,
          createdAt: { gte: range.from, lte: range.to },
          status: { not: OrderStatus.CANCELLED }
        },
        select: { createdAt: true, totalCents: true }
      }),
      db.order.findMany({
        where: {
          restaurantId: rid,
          createdAt: { gte: range.from, lte: range.to },
          status: OrderStatus.CANCELLED
        },
        select: { id: true, totalCents: true }
      })
    ]);

    const caBilledCents = bills.reduce((s, b) => s + b.totalCents, 0);
    const byPayment: Record<PaymentMethod, number> = { CASH: 0, CARD: 0, OTHER: 0 };
    let discountsCents = 0;
    let tipsCents = 0;
    let processorFeesCents = 0;
    for (const b of bills) {
      byPayment[b.paymentMethod] += b.totalCents;
      discountsCents += b.discountCents;
      tipsCents += b.tipCents;
      processorFeesCents += b.processorFeeCents;
    }

    const orderCount = ordersInRange.length;
    const revenueOrdersCents = ordersInRange.reduce((s, o) => s + o.totalCents, 0);
    const avgBasketCents = orderCount > 0 ? Math.round(revenueOrdersCents / orderCount) : 0;

    const hourly = Array.from({ length: 24 }, () => 0);
    for (const o of ordersInRange) {
      const h = new Date(o.createdAt).getHours();
      hourly[h] += 1;
    }
    const peakHour = hourly.reduce((best, n, h) => (n > hourly[best] ? h : best), 0);

    const { tvaCents: vatCollectedCents } = splitVatFromTtcCents(caBilledCents, restaurant.vatMode);

    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      computedAt: new Date().toISOString(),
      restaurantName: restaurant.name,
      chiffreAffairesFactureCents: caBilledCents,
      nombreCommandesCommerce: orderCount,
      panierMoyenCents: avgBasketCents,
      totalCbCents: byPayment.CARD,
      totalEspecesCents: byPayment.CASH,
      totalAutresPaiementsCents: byPayment.OTHER,
      remboursementsCents: 0,
      remboursementsNote: "Aucun flux de remboursement enregistré dans Qrder pour l’instant (intégration Stripe / TPE prévue).",
      annulations: {
        count: cancelledInRange.length,
        totalCommandeTtcCents: cancelledInRange.reduce((s, o) => s + o.totalCents, 0)
      },
      reductionsCents: discountsCents,
      pourboiresCents: tipsCents,
      fraisProcesseurCents: processorFeesCents,
      tvaCollecteeFacturesCents: vatCollectedCents,
      heuresForteActivite: { buckets: hourly, peakHour, peakHourLabel: `${peakHour}h–${peakHour + 1}h` },
      nombreFactures: bills.length
    });
  });

  /** Rapport paiements + net (pour intégrations futures Stripe). */
  r.get("/payments-report", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const bills = await db.bill.findMany({
      where: { restaurantId: rid, createdAt: { gte: range.from, lte: range.to } },
      select: { totalCents: true, paymentMethod: true, tipCents: true, processorFeeCents: true }
    });
    const byPayment: Record<PaymentMethod, number> = { CASH: 0, CARD: 0, OTHER: 0 };
    let gross = 0;
    let tips = 0;
    let fees = 0;
    for (const b of bills) {
      gross += b.totalCents;
      byPayment[b.paymentMethod] += b.totalCents;
      tips += b.tipCents;
      fees += b.processorFeeCents;
    }
    const netRecuCents = gross + tips - fees;
    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      computedAt: new Date().toISOString(),
      totalEncaisseCents: gross,
      detailParMoyen: {
        especesCents: byPayment.CASH,
        carteCents: byPayment.CARD,
        autreCents: byPayment.OTHER
      },
      pourboiresCents: tips,
      remboursementsCents: 0,
      fraisStripeOuProcesseurCents: fees,
      montantNetRecuCents: netRecuCents,
      stripeNote:
        fees === 0
          ? "Aucun frais processeur enregistré. Branchement Stripe / agrégateur : champs facture tipCents / processorFeeCents."
          : null
    });
  });

  /** Liste factures paginée + HT / TVA / TTC (mode TVA actuel établissement). */
  r.get("/bills", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(String(req.query.pageSize), 10) || 25));
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const restaurant = await db.restaurant.findUnique({
      where: { id: rid },
      select: { vatMode: true }
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant introuvable" });

    const qFilter: Prisma.BillWhereInput | undefined = q
      ? /^\d+$/.test(q)
        ? { invoiceNumber: parseInt(q, 10) }
        : { table: { name: { contains: q, mode: "insensitive" } } }
      : undefined;

    const where: Prisma.BillWhereInput = {
      restaurantId: rid,
      createdAt: { gte: range.from, lte: range.to },
      ...qFilter
    };

    const [total, raw] = await Promise.all([
      db.bill.count({ where }),
      db.bill.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          invoiceNumber: true,
          totalCents: true,
          paymentMethod: true,
          createdAt: true,
          publicViewToken: true,
          table: { select: { name: true } }
        }
      })
    ]);

    const items = raw.map((b) => {
      const { netHtCents, tvaCents } = splitVatFromTtcCents(b.totalCents, restaurant.vatMode);
      return {
        ...b,
        htCents: netHtCents,
        tvaCents,
        ttcCents: b.totalCents
      };
    });

    res.json({ page, pageSize, total, items });
  });

  /** KPI dashboard comptable (CA facturé, TVA, tickets, série horaire, tops). */
  r.get("/accountant-dashboard", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const restaurant = await db.restaurant.findUnique({
      where: { id: rid },
      select: { vatMode: true, name: true }
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant introuvable" });

    const dateWhere = { gte: range.from, lte: range.to };
    const commerceWhere = { restaurantId: rid, createdAt: dateWhere, status: { not: OrderStatus.CANCELLED } };
    const orderItemFilter = {
      order: { restaurantId: rid, createdAt: dateWhere, status: { not: OrderStatus.CANCELLED } }
    };

    const [bills, orderCount, lineAgg, itemsForTop, ordersCommerce] = await Promise.all([
      db.bill.findMany({
        where: { restaurantId: rid, createdAt: dateWhere },
        select: { totalCents: true }
      }),
      db.order.count({ where: commerceWhere }),
      db.orderItem.aggregate({
        where: orderItemFilter,
        _sum: { lineTotalCents: true }
      }),
      db.orderItem.findMany({
        where: orderItemFilter,
        select: { nameSnapshot: true, quantity: true, lineTotalCents: true }
      }),
      db.order.findMany({
        where: commerceWhere,
        select: { createdAt: true }
      })
    ]);

    const caFactureCents = bills.reduce((s, b) => s + b.totalCents, 0);
    const { tvaCents: tvaCollecteeCents } = splitVatFromTtcCents(caFactureCents, restaurant.vatMode);
    const ticketCount = bills.length;
    const avgTicketCents = ticketCount > 0 ? Math.round(caFactureCents / ticketCount) : 0;
    const revenueLines = lineAgg._sum.lineTotalCents ?? 0;

    const byName = new Map<string, { qty: number; revenueCents: number }>();
    for (const row of itemsForTop) {
      const cur = byName.get(row.nameSnapshot) ?? { qty: 0, revenueCents: 0 };
      cur.qty += row.quantity;
      cur.revenueCents += row.lineTotalCents;
      byName.set(row.nameSnapshot, cur);
    }
    const topProducts = [...byName.entries()]
      .map(([name, v]) => ({ name, quantitySold: v.qty, revenueCents: v.revenueCents }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 8);

    const hourlyOrders = Array.from({ length: 24 }, () => 0);
    for (const o of ordersCommerce) {
      hourlyOrders[new Date(o.createdAt).getHours()] += 1;
    }

    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      computedAt: new Date().toISOString(),
      restaurantName: restaurant.name,
      vatMode: restaurant.vatMode,
      caFactureCents,
      caLignesCommandesCents: revenueLines,
      tvaCollecteeCents,
      ticketCount,
      panierMoyenCommandeCents: orderCount > 0 ? Math.round(revenueLines / orderCount) : 0,
      panierMoyenTicketCents: avgTicketCents,
      orderCount,
      hourlyOrders,
      topProducts
    });
  });

  /** Journal d’audit (compta / conformité). */
  r.get("/audit-logs", async (req: Request, res: Response) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
    const rid = req.user!.restaurantId;
    const take = Math.min(500, Math.max(10, parseInt(String(req.query.take), 10) || 120));
    const rows = await db.accountingAuditLog.findMany({
      where: { restaurantId: rid, createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: "desc" },
      take,
      include: { user: { select: { email: true } } }
    });
    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      items: rows.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        detail: l.detail,
        userEmail: l.user?.email ?? null
      }))
    });
  });

  /** Méta intégrations (roadmap Sage, Pennylane, etc.). */
  r.get("/integrations", (_req: Request, res: Response) => {
    res.json({
      exports: {
        csv: { encoding: "utf-8-bom", decimalSeparator: "comma", ready: true },
        fec: { status: "planned", label: "FEC / format expert-comptable" },
        sage: { status: "planned" },
        pennylane: { status: "planned" },
        cegid: { status: "planned" },
        ebp: { status: "planned" }
      },
      automation: {
        emailScheduledExport: { status: "planned" },
        bankSync: { status: "planned" },
        nf525: { status: "planned", note: "Certification logiciel de caisse — étude réglementaire requise." }
      }
    });
  });

  return r;
}
