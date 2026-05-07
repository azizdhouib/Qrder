import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const OWNER_EMAIL = "owner@demo.com";
const OWNER_PASSWORD = "demo1234";

type DemoItem = {
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  options: { name: string; priceDeltaCents: number }[];
};

const CATALOG: Record<string, DemoItem[]> = {
  "Articles en vedette": [
    { name: "Brik", description: "Entree chaude tunisienne.", imageUrl: "https://loremflickr.com/1200/800/tunisian,food?lock=301", priceCents: 650, options: [{ name: "Proteine au choix", priceDeltaCents: 0 }] },
    { name: "Sandwich Tounsi", description: "Sandwich tunisien traditionnel.", imageUrl: "https://loremflickr.com/1200/800/sandwich?lock=302", priceCents: 1100, options: [] },
    { name: "Ras Mosli", description: "Plat vedette traditionnel.", imageUrl: "https://loremflickr.com/1200/800/middle-eastern,food?lock=303", priceCents: 1750, options: [] },
    { name: "Assiette Kefteji", description: "Assiette tunisienne kefteji.", imageUrl: "https://loremflickr.com/1200/800/vegetable,stew?lock=304", priceCents: 1300, options: [] },
    { name: "Grillade Poisson", description: "Poisson grille.", imageUrl: "https://loremflickr.com/1200/800/grilled,fish?lock=305", priceCents: 1990, options: [] },
    { name: "Chorba Frik", description: "Soupe frik tunisienne.", imageUrl: "https://loremflickr.com/1200/800/soup?lock=306", priceCents: 800, options: [] },
    { name: "Mloukhia", description: "Plat tunisien mloukhia.", imageUrl: "https://loremflickr.com/1200/800/stew?lock=307", priceCents: 1790, options: [] }
  ],
  "Entrees Froides": [
    { name: "Salade Tunisienne", description: "Salade tunisienne fraiche.", imageUrl: "https://loremflickr.com/1200/800/salad?lock=311", priceCents: 950, options: [] },
    { name: "Salade Mechouia", description: "Salade mechouia.", imageUrl: "https://loremflickr.com/1200/800/roasted,pepper,salad?lock=312", priceCents: 1000, options: [] }
  ],
  "Entrees Chaudes": [
    { name: "Brik", description: "Proteine au choix.", imageUrl: "https://loremflickr.com/1200/800/pastry?lock=313", priceCents: 650, options: [{ name: "Proteine au choix", priceDeltaCents: 0 }] },
    { name: "Chorba Frik", description: "Soupe chaude.", imageUrl: "https://loremflickr.com/1200/800/soup?lock=314", priceCents: 800, options: [] },
    { name: "Tajine Simple", description: "Tajine simple.", imageUrl: "https://loremflickr.com/1200/800/tajine?lock=315", priceCents: 600, options: [] },
    { name: "Chorba Langue D'oiseau", description: "Soupe langue d'oiseau.", imageUrl: "https://loremflickr.com/1200/800/noodle,soup?lock=316", priceCents: 800, options: [] }
  ],
  "Sandwichs Tunisiens": [
    { name: "Sandwich Tounsi", description: "Sandwich tunisien.", imageUrl: "https://loremflickr.com/1200/800/sandwich?lock=317", priceCents: 1100, options: [] },
    { name: "Sandwich Kefteji", description: "Sandwich kefteji.", imageUrl: "https://loremflickr.com/1200/800/sandwich?lock=318", priceCents: 1100, options: [] },
    { name: "Sandwich Mixte", description: "Sandwich mixte.", imageUrl: "https://loremflickr.com/1200/800/sandwich?lock=319", priceCents: 1250, options: [] }
  ],
  Plats: [
    { name: "Ras Mosli", description: "Plat principal tunisien.", imageUrl: "https://loremflickr.com/1200/800/main-course?lock=321", priceCents: 1750, options: [] },
    { name: "Mloukhia", description: "Mloukhia maison.", imageUrl: "https://loremflickr.com/1200/800/stew?lock=322", priceCents: 1790, options: [] },
    { name: "Couscous", description: "Proteine au choix.", imageUrl: "https://loremflickr.com/1200/800/couscous?lock=323", priceCents: 1600, options: [{ name: "Poulet", priceDeltaCents: 0 }, { name: "Agneau", priceDeltaCents: 0 }, { name: "Merguez", priceDeltaCents: 0 }] },
    { name: "Spaghettis Fell", description: "Proteine au choix.", imageUrl: "https://loremflickr.com/1200/800/spaghetti?lock=324", priceCents: 1600, options: [{ name: "Poulet", priceDeltaCents: 0 }, { name: "Boeuf", priceDeltaCents: 0 }] },
    { name: "Riz Djerbien", description: "Riz djerbien.", imageUrl: "https://loremflickr.com/1200/800/rice,dish?lock=325", priceCents: 1650, options: [] }
  ],
  "Assiettes Tunisiennes": [
    { name: "Assiette Tunisienne", description: "Assiette tunisienne.", imageUrl: "https://loremflickr.com/1200/800/platter?lock=326", priceCents: 1300, options: [] },
    { name: "Assiette Mixte", description: "Assiette mixte.", imageUrl: "https://loremflickr.com/1200/800/platter?lock=327", priceCents: 1690, options: [] },
    { name: "Assiette Kefteji", description: "Assiette kefteji.", imageUrl: "https://loremflickr.com/1200/800/platter?lock=328", priceCents: 1300, options: [] },
    { name: "Assiette Ojja", description: "Proteine au choix.", imageUrl: "https://loremflickr.com/1200/800/egg,tomato?lock=329", priceCents: 1200, options: [{ name: "Proteine au choix", priceDeltaCents: 0 }] },
    { name: "Assiette Escalope", description: "Assiette escalope.", imageUrl: "https://loremflickr.com/1200/800/escalope?lock=330", priceCents: 1400, options: [] }
  ],
  Grillades: [
    { name: "Grillade Poisson", description: "Grillade poisson.", imageUrl: "https://loremflickr.com/1200/800/grilled,fish?lock=331", priceCents: 1990, options: [] }
  ],
  "Menus Enfants": [],
  Desserts: [],
  Boissons: [
    { name: "Coca Cola 33cl", description: "Boisson fraiche.", imageUrl: "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=80", priceCents: 300, options: [] },
    { name: "Eau minerale 50cl", description: "Plate ou gazeuse.", imageUrl: "https://images.pexels.com/photos/11031194/pexels-photo-11031194.png?cs=srgb&dl=pexels-moises-ribeiro-121009898-11031194.jpg&fm=jpg", priceCents: 250, options: [{ name: "Gazeuse", priceDeltaCents: 0 }] }
  ]
};

async function main() {
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);

  let user = await db.user.findUnique({
    where: { email: OWNER_EMAIL },
    include: { restaurant: true }
  });

  if (!user) {
    const restaurant = await db.restaurant.create({
      data: {
        name: "Demo Bistro",
        slug: `demo-bistro-${Math.floor(Math.random() * 100000)}`
      }
    });

    user = await db.user.create({
      data: {
        email: OWNER_EMAIL,
        passwordHash,
        role: "OWNER",
        restaurantId: restaurant.id
      },
      include: { restaurant: true }
    });
  } else if (!user.passwordHash) {
    user = await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
      include: { restaurant: true }
    });
  }

  const restaurantId = user.restaurantId;
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  for (let i = 1; i <= 6; i += 1) {
    const tableName = `T${i}`;
    const hasTable = await db.table.findFirst({
      where: { restaurantId, name: tableName }
    });
    if (!hasTable) {
      await db.table.create({
        data: { restaurantId, name: tableName, qrToken: randomUUID() }
      });
    }
  }

  await db.menuItem.updateMany({
    where: { restaurantId },
    data: { isActive: false }
  });

  let position = 1;
  for (const [categoryName, items] of Object.entries(CATALOG)) {
    const existingCategory = await db.menuCategory.findFirst({
      where: { restaurantId, name: categoryName }
    });

    const category = existingCategory
      ? await db.menuCategory.update({
          where: { id: existingCategory.id },
          data: { position, isActive: true }
        })
      : await db.menuCategory.create({
          data: { restaurantId, name: categoryName, position, isActive: true }
        });

    position += 1;

    for (const item of items) {
      const existingItem = await db.menuItem.findFirst({
        where: {
          restaurantId,
          categoryId: category.id,
          name: item.name
        }
      });

      let menuItemId = "";
      if (existingItem) {
        const updated = await db.menuItem.update({
          where: { id: existingItem.id },
          data: {
            description: item.description,
            imageUrl: item.imageUrl,
            priceCents: item.priceCents,
            isActive: true
          }
        });
        menuItemId = updated.id;
      } else {
        const created = await db.menuItem.create({
          data: {
            restaurantId,
            categoryId: category.id,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            priceCents: item.priceCents,
            isActive: true
          }
        });
        menuItemId = created.id;
      }

      const currentOptions = await db.menuItemOption.findMany({
        where: { menuItemId }
      });
      const currentByName = new Map(currentOptions.map((opt) => [opt.name, opt]));
      const nextNames = new Set(item.options.map((opt) => opt.name));

      for (const option of item.options) {
        const existingOption = currentByName.get(option.name);
        if (existingOption) {
          await db.menuItemOption.update({
            where: { id: existingOption.id },
            data: { priceDeltaCents: option.priceDeltaCents }
          });
        } else {
          await db.menuItemOption.create({
            data: {
              menuItemId,
              name: option.name,
              priceDeltaCents: option.priceDeltaCents
            }
          });
        }
      }

      for (const opt of currentOptions) {
        if (!nextNames.has(opt.name)) {
          await db.menuItemOption.delete({ where: { id: opt.id } });
        }
      }
    }
  }

  const tables = await db.table.findMany({
    where: { restaurantId },
    orderBy: { name: "asc" },
    take: 2
  });

  // eslint-disable-next-line no-console
  console.log("Demo seed ready for owner@demo.com");
  // eslint-disable-next-line no-console
  console.log(`Restaurant: ${user.restaurant.name} (${user.restaurant.slug})`);
  // eslint-disable-next-line no-console
  console.log("Use login password:", OWNER_PASSWORD);
  for (const table of tables) {
    // eslint-disable-next-line no-console
    console.log(`${table.name} => ${webOrigin}/r/${user.restaurant.slug}/t/${table.qrToken}`);
  }
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
