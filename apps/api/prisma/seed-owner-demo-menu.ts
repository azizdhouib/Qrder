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

const wm = (filename: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1200`;

const CATALOG: Record<string, DemoItem[]> = {
  "Entrees Froides": [
    {
      name: "Salade Tunisienne",
      description: "Tomates, concombres, oignons, thon et oeuf dur, vinaigrette citronnee.",
      imageUrl: wm("Tunisian Salad.jpg"),
      priceCents: 950,
      options: []
    },
    {
      name: "Salade Mechouia",
      description: "Poivrons et tomates grilles, ail, huile d'olive, thon et oeuf.",
      imageUrl: wm("Salade Mechouwya, Tunisie, juin 2021.jpg"),
      priceCents: 1000,
      options: []
    },
    {
      name: "Omek Horia",
      description: "Caviar de carottes epicees, harissa, cumin, ail.",
      imageUrl: wm("سلاطة أمك حورية.jpg"),
      priceCents: 900,
      options: []
    },
    {
      name: "Salade El Bey",
      description: "Salade signature de la maison, fraicheur et generosite.",
      imageUrl: wm("Préparation salade Tunisienne.JPG"),
      priceCents: 1050,
      options: []
    }
  ],
  "Entrees Chaudes": [
    {
      name: "Brik",
      description: "Feuille croustillante a l'oeuf, thon, persil, harissa.",
      imageUrl: wm("Brik, Tajin and salad.JPG"),
      priceCents: 650,
      options: [
        { name: "Thon", priceDeltaCents: 0 },
        { name: "Viande hachee", priceDeltaCents: 100 },
        { name: "Fromage", priceDeltaCents: 100 }
      ]
    },
    {
      name: "Chorba Frik",
      description: "Soupe traditionnelle de ble vert concasse et viande.",
      imageUrl: wm("CHORBA FRIK TUNISIENNE.jpg"),
      priceCents: 800,
      options: []
    },
    {
      name: "Tajine Simple",
      description: "Tajine tunisien aux oeufs, fromage et legumes.",
      imageUrl: wm("Tajine tunisien, 2019.jpg"),
      priceCents: 600,
      options: []
    },
    {
      name: "Chorba Langue d'Oiseau",
      description: "Soupe a la langue d'oiseau (lsen el aasfour), tomates et viande.",
      imageUrl: wm("CHORBA FRIK TUNISIENNE.jpg"),
      priceCents: 800,
      options: []
    }
  ],
  "Sandwichs Tunisiens": [
    {
      name: "Sandwich Tounsi",
      description: "Le casse-croute tunisien : thon, oeuf, harissa, olives, mechouia.",
      imageUrl: wm("Brik, Tajin and salad.JPG"),
      priceCents: 1100,
      options: []
    },
    {
      name: "Sandwich Kefteji",
      description: "Sandwich aux legumes frits, oeuf et harissa.",
      imageUrl: wm("Kefteji 2.jpg"),
      priceCents: 1100,
      options: []
    },
    {
      name: "Sandwich Mixte",
      description: "Generosite tunisienne : thon, viande hachee, oeuf, harissa.",
      imageUrl: wm("Brik, Tajin and salad.JPG"),
      priceCents: 1250,
      options: []
    }
  ],
  Plats: [
    {
      name: "Ras Mosli",
      description: "Tete d'agneau braisee, specialite tunisienne emblematique.",
      imageUrl: wm("Couscous Tunisien au poulet ( Tunisian chiken couscous ).jpg"),
      priceCents: 1750,
      options: []
    },
    {
      name: "Couscous",
      description: "Couscous traditionnel mijote, semoule fine, legumes et bouillon.",
      imageUrl: wm("Couscous Tunisien au poulet ( Tunisian chiken couscous ).jpg"),
      priceCents: 1600,
      options: [
        { name: "Poulet", priceDeltaCents: 0 },
        { name: "Agneau", priceDeltaCents: 200 },
        { name: "Merguez", priceDeltaCents: 100 }
      ]
    },
    {
      name: "Spaghettis Fell",
      description: "Pates a la sauce tomate epicee, plat populaire tunisien.",
      imageUrl: wm("Couscous Tunisien au poulet ( Tunisian chiken couscous ).jpg"),
      priceCents: 1600,
      options: [
        { name: "Poulet", priceDeltaCents: 0 },
        { name: "Boeuf", priceDeltaCents: 100 }
      ]
    },
    {
      name: "Riz Djerbien",
      description: "Riz parfume aux herbes, viande et legumes, specialite de Djerba.",
      imageUrl: wm("Riz jerbi.JPG"),
      priceCents: 1650,
      options: []
    },
    {
      name: "Mloukhia",
      description: "Ragout de feuilles de corete, viande tendre, plat traditionnel.",
      imageUrl: wm("Molokheya hi res.JPG"),
      priceCents: 1790,
      options: []
    }
  ],
  "Assiettes Tunisiennes": [
    {
      name: "Assiette Tunisienne",
      description: "Plateau decouverte de specialites tunisiennes.",
      imageUrl: wm("Brik, Tajin and salad.JPG"),
      priceCents: 1300,
      options: []
    },
    {
      name: "Assiette Mixte",
      description: "Generosite tunisienne : kefteji, ojja, brik, salade.",
      imageUrl: wm("Brik, Tajin and salad.JPG"),
      priceCents: 1690,
      options: []
    },
    {
      name: "Assiette Kefteji",
      description: "Legumes frits hache, oeuf brouille, harissa, plat populaire.",
      imageUrl: wm("Kefteji 2.jpg"),
      priceCents: 1300,
      options: []
    },
    {
      name: "Assiette Ojja",
      description: "Sauce tomate epicee aux oeufs et merguez, harissa.",
      imageUrl: wm("Ojja merguez, Tunisie, avril 2019.jpg"),
      priceCents: 1200,
      options: [
        { name: "Merguez", priceDeltaCents: 0 },
        { name: "Crevettes", priceDeltaCents: 300 },
        { name: "Poulet", priceDeltaCents: 100 }
      ]
    }
  ],
  Grillades: [
    {
      name: "Grillade Poisson",
      description: "Daurade ou bar grille, riz et salade verte.",
      imageUrl: wm("Daurade grillée, riz et salade verte servie à Lyon, France.jpg"),
      priceCents: 1990,
      options: []
    },
    {
      name: "Grillade Mixte",
      description: "Brochettes d'agneau, merguez, escalope de poulet, frites.",
      imageUrl: wm("Huit merguez et trois saucisses en début de cuisson au barbecue en mars 2020.jpg"),
      priceCents: 1900,
      options: []
    },
    {
      name: "Escalope de Poulet",
      description: "Escalope grillee, sauce a la creme, riz ou frites.",
      imageUrl: wm("Riz et Escalope de poulet à la crème.jpg"),
      priceCents: 1400,
      options: [
        { name: "Riz", priceDeltaCents: 0 },
        { name: "Frites", priceDeltaCents: 0 }
      ]
    },
    {
      name: "Gambas Royales",
      description: "Gambas grillees a la plancha, riz parfume.",
      imageUrl: wm("Gambas grillés à Dole (Jura).JPG"),
      priceCents: 2200,
      options: []
    }
  ],
  Desserts: [
    {
      name: "Assida Zgougou",
      description: "Creme de pignons de pin d'Alep, decoration aux fruits secs.",
      imageUrl: wm("Assida Zgougou familiale.jpg"),
      priceCents: 600,
      options: []
    },
    {
      name: "Patisseries Orientales",
      description: "Assortiment de baklawa, makroudh et samsa au miel et amandes.",
      imageUrl: wm("Baklawas.JPG"),
      priceCents: 550,
      options: []
    },
    {
      name: "Bouza",
      description: "Creme onctueuse aux noix de pin et fleur d'oranger.",
      imageUrl: wm("Assida Zgougou familiale.jpg"),
      priceCents: 600,
      options: []
    }
  ],
  Boissons: [
    {
      name: "Coca-Cola 33cl",
      description: "Boisson fraiche.",
      imageUrl: "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=80",
      priceCents: 300,
      options: []
    },
    {
      name: "Eau Minerale 50cl",
      description: "Plate ou gazeuse.",
      imageUrl: "https://images.pexels.com/photos/11031194/pexels-photo-11031194.png?auto=compress&cs=tinysrgb&w=1200",
      priceCents: 250,
      options: [
        { name: "Plate", priceDeltaCents: 0 },
        { name: "Gazeuse", priceDeltaCents: 0 }
      ]
    },
    {
      name: "The a la Menthe",
      description: "The vert a la menthe fraiche, sucre.",
      imageUrl: "https://images.pexels.com/photos/230477/pexels-photo-230477.jpeg?auto=compress&cs=tinysrgb&w=1200",
      priceCents: 350,
      options: []
    },
    {
      name: "Cafe Express",
      description: "Cafe arabica corse.",
      imageUrl: "https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=1200",
      priceCents: 250,
      options: []
    },
    {
      name: "Jus d'Orange Frais",
      description: "Presse a la commande.",
      imageUrl: "https://images.pexels.com/photos/1435735/pexels-photo-1435735.jpeg?auto=compress&cs=tinysrgb&w=1200",
      priceCents: 400,
      options: []
    }
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
        name: "El Bey",
        slug: `el-bey-${Math.floor(Math.random() * 100000)}`
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

  await db.restaurant.update({
    where: { id: user.restaurantId },
    data: { name: "El Bey" }
  });
  user = await db.user.findUnique({
    where: { id: user.id },
    include: { restaurant: true }
  });
  if (!user) throw new Error("User vanished after restaurant rename");

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

  await db.menuCategory.updateMany({
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
