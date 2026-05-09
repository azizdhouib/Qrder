-- Salle principale (non supprimable) + rattachement des tables sans salle.
ALTER TABLE "qr_floor_rooms" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Une salle marquée par défaut par restaurant (la plus ancienne si des salles existent déjà).
UPDATE "qr_floor_rooms" fr
SET "isDefault" = true
FROM (
  SELECT DISTINCT ON ("restaurantId") id
  FROM "qr_floor_rooms"
  ORDER BY "restaurantId", "createdAt" ASC
) sub
WHERE fr.id = sub.id
  AND NOT EXISTS (
    SELECT 1 FROM "qr_floor_rooms" x WHERE x."restaurantId" = fr."restaurantId" AND x."isDefault" = true
  );

-- Restaurants sans aucune salle : créer « Salle 1 ».
INSERT INTO "qr_floor_rooms" ("id", "name", "restaurantId", "createdAt", "isDefault")
SELECT
  md5(random()::text || clock_timestamp()::text || r.id)::text,
  'Salle 1',
  r.id,
  CURRENT_TIMESTAMP,
  true
FROM "qr_restaurants" r
WHERE NOT EXISTS (SELECT 1 FROM "qr_floor_rooms" fr WHERE fr."restaurantId" = r.id);

-- Tables sans salle → salle par défaut du même restaurant.
UPDATE "qr_tables" t
SET "roomId" = fr.id
FROM "qr_floor_rooms" fr
WHERE t."roomId" IS NULL
  AND fr."restaurantId" = t."restaurantId"
  AND fr."isDefault" = true;
