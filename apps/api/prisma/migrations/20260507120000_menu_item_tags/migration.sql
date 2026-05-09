-- AlterTable
ALTER TABLE "qr_menu_items" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
