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
  console.log("Seed done. Table token:", table.qrToken);
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
