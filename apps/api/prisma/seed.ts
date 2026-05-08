import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const restaurant = await db.restaurant.upsert({
    where: { slug: "demo-bistro" },
    update: {},
    create: { name: "Demo Bistro", slug: "demo-bistro" }
  });

  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  if (platformEmail && platformPassword && platformPassword.length >= 8) {
    const ph = await bcrypt.hash(platformPassword, 10);
    await db.platformAdmin.upsert({
      where: { email: platformEmail },
      update: { passwordHash: ph },
      create: { email: platformEmail, passwordHash: ph }
    });
    // eslint-disable-next-line no-console
    console.log("Super admin plateforme:", platformEmail, "(mot de passe depuis PLATFORM_ADMIN_PASSWORD)");
  }

  await db.user.upsert({
    where: { email: "owner@demo.com" },
    update: {},
    create: {
      email: "owner@demo.com",
      passwordHash,
      role: "OWNER",
      restaurantId: restaurant.id
    }
  });

  await db.user.upsert({
    where: { email: "kitchen@demo.com" },
    update: { passwordHash, role: "KITCHEN" },
    create: {
      email: "kitchen@demo.com",
      passwordHash,
      role: "KITCHEN",
      restaurantId: restaurant.id
    }
  });

  const table = await db.table.create({
    data: { name: "T1", qrToken: randomUUID(), restaurantId: restaurant.id }
  });

  const cat = await db.menuCategory.create({
    data: { name: "Burgers", position: 1, restaurantId: restaurant.id }
  });

  await db.menuItem.create({
    data: {
      name: "Classic Burger",
      description: "Steak, cheddar, salade, sauce maison",
      priceCents: 1200,
      categoryId: cat.id,
      restaurantId: restaurant.id,
      options: {
        create: [
          { name: "Frites", priceDeltaCents: 300 },
          { name: "Bacon", priceDeltaCents: 200 }
        ]
      }
    }
  });

  // eslint-disable-next-line no-console
  console.log("Seed done. Owner owner@demo.com / Cuisine kitchen@demo.com (même mot de passe demo). Table token:", table.qrToken);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
