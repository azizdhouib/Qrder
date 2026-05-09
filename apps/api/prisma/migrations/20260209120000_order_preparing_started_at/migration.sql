-- Heure d’entrée en préparation pour le KDS (timer « en préparation depuis », alerte orange après 10 min).
ALTER TABLE "qr_orders" ADD COLUMN IF NOT EXISTS "preparingStartedAt" TIMESTAMP(3);
