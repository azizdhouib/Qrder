-- Colonne utilisée pour « servies récemment » (fenêtre glissante depuis le dernier changement d’état, pas depuis la création).
-- À appliquer sur la base existante si `prisma migrate` n’est pas utilisé : exécuter ce SQL dans le SQL editor Supabase.
ALTER TABLE "qr_orders" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
