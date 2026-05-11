-- Facturation : mentions légales restaurant, client sur commande, jeton public facture, références caisse.

CREATE TYPE "qr_restaurant_vat_mode" AS ENUM ('TTC_FR_10', 'TTC_FR_20', 'VAT_EXEMPT_ART293B');

ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'FR';
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "billingEmail" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "siret" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "vatNumber" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "invoiceFooterLegal" TEXT;
ALTER TABLE "qr_restaurants" ADD COLUMN IF NOT EXISTS "vatMode" "qr_restaurant_vat_mode" NOT NULL DEFAULT 'TTC_FR_10';

ALTER TABLE "qr_orders" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "qr_orders" ADD COLUMN IF NOT EXISTS "covers" INTEGER;

ALTER TABLE "qr_bills" ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;
ALTER TABLE "qr_bills" ADD COLUMN IF NOT EXISTS "publicViewToken" TEXT;
ALTER TABLE "qr_bills" ADD COLUMN IF NOT EXISTS "registeredByLabel" TEXT;
ALTER TABLE "qr_bills" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "qr_bills" ADD COLUMN IF NOT EXISTS "serviceFeeCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "qr_bills"
SET
  "paymentReference" = REPLACE(gen_random_uuid()::text, '-', ''),
  "publicViewToken" = gen_random_uuid()::text
WHERE "paymentReference" IS NULL OR "publicViewToken" IS NULL;

ALTER TABLE "qr_bills" ALTER COLUMN "paymentReference" SET NOT NULL;
ALTER TABLE "qr_bills" ALTER COLUMN "publicViewToken" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "qr_bills_paymentReference_key" ON "qr_bills" ("paymentReference");
CREATE UNIQUE INDEX IF NOT EXISTS "qr_bills_publicViewToken_key" ON "qr_bills" ("publicViewToken");
