DO $$
BEGIN
  CREATE TYPE "qr_user_role" AS ENUM ('OWNER', 'MANAGER', 'KITCHEN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "qr_order_status" AS ENUM ('PLACED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "qr_restaurants" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "qr_users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role" "qr_user_role" NOT NULL DEFAULT 'OWNER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restaurantId" TEXT NOT NULL,
  CONSTRAINT "qr_users_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "qr_tables" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "restaurantId" TEXT NOT NULL,
  CONSTRAINT "qr_tables_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "qr_tables_restaurantId_qrToken_key"
  ON "qr_tables" ("restaurantId", "qrToken");

CREATE TABLE IF NOT EXISTS "qr_menu_categories" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "restaurantId" TEXT NOT NULL,
  CONSTRAINT "qr_menu_categories_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "qr_menu_items" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "categoryId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  CONSTRAINT "qr_menu_items_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "qr_menu_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "qr_menu_items_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "qr_menu_item_options" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "menuItemId" TEXT NOT NULL,
  CONSTRAINT "qr_menu_item_options_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "qr_menu_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "qr_orders" (
  "id" TEXT PRIMARY KEY,
  "orderNumber" INTEGER NOT NULL,
  "status" "qr_order_status" NOT NULL DEFAULT 'PLACED',
  "totalCents" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restaurantId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  CONSTRAINT "qr_orders_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "qr_orders_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "qr_tables"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "qr_orders_restaurantId_orderNumber_key"
  ON "qr_orders" ("restaurantId", "orderNumber");

CREATE TABLE IF NOT EXISTS "qr_order_items" (
  "id" TEXT PRIMARY KEY,
  "quantity" INTEGER NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "lineTotalCents" INTEGER NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  CONSTRAINT "qr_order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "qr_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "qr_order_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "qr_menu_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "qr_order_item_option_choices" (
  "id" TEXT PRIMARY KEY,
  "nameSnapshot" TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL,
  "orderItemId" TEXT NOT NULL,
  CONSTRAINT "qr_order_item_option_choices_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "qr_order_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
