-- Export comptabilité : type de commande, TVA 5,5 %, pourboires / frais, journal d'audit.

CREATE TYPE "qr_order_fulfillment" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY');

ALTER TABLE "qr_orders" ADD COLUMN "fulfillmentType" "qr_order_fulfillment" NOT NULL DEFAULT 'DINE_IN';

ALTER TYPE "qr_restaurant_vat_mode" ADD VALUE 'TTC_FR_55';

ALTER TABLE "qr_bills" ADD COLUMN "tipCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "qr_bills" ADD COLUMN "processorFeeCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "qr_accounting_audit_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_accounting_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "qr_accounting_audit_logs_restaurantId_createdAt_idx" ON "qr_accounting_audit_logs"("restaurantId", "createdAt");

ALTER TABLE "qr_accounting_audit_logs" ADD CONSTRAINT "qr_accounting_audit_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qr_accounting_audit_logs" ADD CONSTRAINT "qr_accounting_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "qr_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
