-- Factures / encaissements (caisse + compta)
CREATE TYPE "qr_payment_method" AS ENUM ('CASH', 'CARD', 'OTHER');

CREATE TABLE "qr_bills" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paymentMethod" "qr_payment_method" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredByUserId" TEXT,

    CONSTRAINT "qr_bills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qr_bills_restaurantId_invoiceNumber_key" ON "qr_bills"("restaurantId", "invoiceNumber");

ALTER TABLE "qr_bills" ADD CONSTRAINT "qr_bills_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qr_bills" ADD CONSTRAINT "qr_bills_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "qr_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qr_bills" ADD CONSTRAINT "qr_bills_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "qr_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "qr_orders" ADD COLUMN "billId" TEXT;
ALTER TABLE "qr_orders" ADD CONSTRAINT "qr_orders_billId_fkey" FOREIGN KEY ("billId") REFERENCES "qr_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
