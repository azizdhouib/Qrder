-- Salles (zones) du plan + liaison optionnelle des tables.
CREATE TABLE "qr_floor_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qr_floor_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "qr_floor_rooms_restaurantId_name_key" ON "qr_floor_rooms"("restaurantId", "name");

ALTER TABLE "qr_floor_rooms" ADD CONSTRAINT "qr_floor_rooms_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "qr_restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "qr_tables" ADD COLUMN "roomId" TEXT;
ALTER TABLE "qr_tables" ADD CONSTRAINT "qr_tables_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "qr_floor_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
