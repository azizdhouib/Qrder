import "./loadEnvFirst.js";
import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import QRCode from "qrcode";
import { Server } from "socket.io";
import type { Prisma } from "@prisma/client";
import { OrderFulfillmentType, OrderStatus, PaymentMethod, RestaurantVatMode, UserRole } from "@prisma/client";
import { z } from "zod";
import { authRequired, requireRoles, signAuthToken } from "./auth.js";
import { createAdminRouter } from "./adminRoutes.js";
import { createAccountingRouter } from "./accounting/accountingRoutes.js";
import { writeAccountingAudit } from "./accounting/auditLog.js";
import { db } from "./db.js";

const corsOrigins = (process.env.WEB_ORIGIN ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOption =
  corsOrigins.length === 1 && corsOrigins[0] === "*"
    ? { origin: "*" as const }
    : { origin: corsOrigins, credentials: true };

const app = express();
app.use(cors(corsOption));
app.use(express.json({ limit: "8mb" }));

const staffOnly = requireRoles("OWNER", "MANAGER");

const server = http.createServer(app);
const io = new Server(server, { cors: corsOption });

io.on("connection", (socket) => {
  socket.on("joinRestaurant", (restaurantId: string) => {
    socket.join(`restaurant:${restaurantId}`);
  });
  socket.on("joinOrder", (orderId: string) => {
    socket.join(`order:${orderId}`);
  });
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function uniquePaymentReference(): string {
  return randomBytes(10).toString("hex").toUpperCase().slice(0, 20);
}

const MENU_ITEM_MAX_TAGS = 12;
const MENU_ITEM_MAX_TAG_LEN = 40;

function normalizeMenuItemTags(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = String(r).trim().slice(0, MENU_ITEM_MAX_TAG_LEN);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MENU_ITEM_MAX_TAGS) break;
  }
  return out;
}

function isPrismaDbUnreachable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "P1001" || code === "P1002" || code === "P1017";
}

app.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (err) {
    if (isPrismaDbUnreachable(err)) {
      return res.status(503).json({ ok: false, message: "Base de données injoignable" });
    }
    console.error("GET /health:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
});

app.use("/admin", createAdminRouter());
app.use("/accounting", createAccountingRouter());

app.post("/auth/register", (_req, res) => {
  res.status(403).json({
    message:
      "Inscription publique désactivée. Les comptes restaurant et équipe sont créés par l’administrateur."
  });
});

app.post("/auth/login", async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1)
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  try {
    const user = await db.user.findUnique({
      where: { email: body.data.email.toLowerCase() },
      include: { restaurant: true }
    });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isValid = await bcrypt.compare(body.data.password, user.passwordHash);
    if (!isValid) return res.status(401).json({ message: "Invalid credentials" });

    if (user.restaurant.suspended) {
      return res.status(403).json({
        message: "Cet établissement est suspendu. Contacte l’administrateur Qrder."
      });
    }

    const token = signAuthToken({
      userId: user.id,
      restaurantId: user.restaurantId,
      role: user.role
    });

    return res.json({
      token,
      role: user.role,
      restaurant: {
        id: user.restaurant.id,
        name: user.restaurant.name,
        slug: user.restaurant.slug
      }
    });
  } catch (err) {
    if (isPrismaDbUnreachable(err)) {
      console.error("POST /auth/login: database unreachable", err);
      return res.status(503).json({
        message:
          "Impossible de joindre la base de données (réseau ou Supabase). Vérifie ta connexion Internet et le statut du projet Supabase, puis réessaie."
      });
    }
    console.error("POST /auth/login:", err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
});

app.get("/me", authRequired, async (req, res) => {
  const restaurant = await db.restaurant.findUnique({
    where: { id: req.user!.restaurantId }
  });
  if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
  res.json({
    userId: req.user!.userId,
    role: req.user!.role,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      currency: restaurant.currency,
      suspended: restaurant.suspended
    }
  });
});

app.get("/team/users", authRequired, staffOnly, async (req, res) => {
  const users = await db.user.findMany({
    where: { restaurantId: req.user!.restaurantId },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: [{ role: "asc" }, { email: "asc" }]
  });
  res.json(users);
});

const teamUserCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["MANAGER", "KITCHEN"])
});

app.post("/team/users", authRequired, staffOnly, async (req, res) => {
  const parsed = teamUserCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Payload invalide", issues: parsed.error.issues });
  }

  if (req.user!.role === "MANAGER" && parsed.data.role === "MANAGER") {
    return res.status(403).json({
      message: "Seul le propriétaire peut créer un compte gérant."
    });
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Cet email est déjà utilisé." });
  }

  const role =
    parsed.data.role === "MANAGER" ? UserRole.MANAGER : UserRole.KITCHEN;

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      role,
      restaurantId: req.user!.restaurantId
    }
  });

  return res.status(201).json({
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  });
});

app.delete("/team/users/:id", authRequired, staffOnly, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id?.trim()) {
    return res.status(400).json({ message: "Identifiant requis." });
  }

  if (id === req.user!.userId) {
    return res.status(400).json({ message: "Tu ne peux pas supprimer ton propre compte." });
  }

  const target = await db.user.findFirst({
    where: { id, restaurantId: req.user!.restaurantId }
  });
  if (!target) {
    return res.status(404).json({ message: "Utilisateur introuvable." });
  }

  if (target.role === UserRole.OWNER) {
    return res.status(403).json({
      message: "Le compte propriétaire ne peut pas être supprimé depuis cette interface."
    });
  }

  if (req.user!.role === "MANAGER" && target.role !== UserRole.KITCHEN) {
    return res.status(403).json({
      message: "Avec un compte gérant, tu ne peux supprimer que des comptes cuisine."
    });
  }

  await db.user.delete({ where: { id } });
  res.status(204).send();
});

app.get("/me/restaurant", authRequired, async (req, res) => {
  const restaurant = await db.restaurant.findUnique({
    where: { id: req.user!.restaurantId }
  });
  res.json(restaurant);
});

const invoiceProfilePatchSchema = z.object({
  legalName: z.string().max(200).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(8).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  billingEmail: z.string().email().max(200).nullable().optional(),
  siret: z.string().max(20).nullable().optional(),
  vatNumber: z.string().max(40).nullable().optional(),
  logoUrl: z.string().max(2000).nullable().optional(),
  invoiceFooterLegal: z.string().max(4000).nullable().optional(),
  vatMode: z.nativeEnum(RestaurantVatMode).optional()
});

app.patch("/me/restaurant/invoice-profile", authRequired, staffOnly, async (req, res) => {
  const parsed = invoiceProfilePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Payload invalide", issues: parsed.error.issues });
  }
  const data = parsed.data;
  const updated = await db.restaurant.update({
    where: { id: req.user!.restaurantId },
    data: {
      ...(data.legalName !== undefined ? { legalName: data.legalName } : {}),
      ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
      ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
      ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.billingEmail !== undefined ? { billingEmail: data.billingEmail } : {}),
      ...(data.siret !== undefined ? { siret: data.siret } : {}),
      ...(data.vatNumber !== undefined ? { vatNumber: data.vatNumber } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.invoiceFooterLegal !== undefined ? { invoiceFooterLegal: data.invoiceFooterLegal } : {}),
      ...(data.vatMode !== undefined ? { vatMode: data.vatMode } : {})
    }
  });
  res.json(updated);
});

app.post("/tables", authRequired, staffOnly, async (req, res) => {
  const body = z
    .object({
      name: z.string().min(1),
      roomId: z.string().cuid().optional()
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const name = body.data.name.trim();
  if (!name) return res.status(400).json({ message: "Invalid payload" });

  const restaurantId = req.user!.restaurantId;
  let roomId = body.data.roomId ?? null;
  if (roomId) {
    const roomOk = await db.floorRoom.findFirst({
      where: { id: roomId, restaurantId }
    });
    if (!roomOk) return res.status(400).json({ message: "Salle introuvable." });
  } else {
    const def = await db.floorRoom.findFirst({
      where: { restaurantId, isDefault: true }
    });
    if (!def) {
      return res.status(400).json({ message: "Aucune salle par défaut. Contacte le support." });
    }
    roomId = def.id;
  }

  const dup = await db.table.findFirst({
    where: {
      restaurantId,
      name: { equals: name, mode: "insensitive" }
    }
  });
  if (dup) return res.status(409).json({ message: "Une table avec ce nom existe déjà." });

  const table = await db.table.create({
    data: {
      name,
      qrToken: randomUUID(),
      restaurantId,
      roomId
    }
  });

  res.status(201).json(table);
});

app.get("/tables", authRequired, staffOnly, async (req, res) => {
  const tables = await db.table.findMany({
    where: { restaurantId: req.user!.restaurantId },
    orderBy: { name: "asc" }
  });
  res.json(tables);
});

app.get("/floor-rooms", authRequired, staffOnly, async (req, res) => {
  const rooms = await db.floorRoom.findMany({
    where: { restaurantId: req.user!.restaurantId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });
  res.json(rooms);
});

app.post("/floor-rooms", authRequired, staffOnly, async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });
  const name = body.data.name.trim();
  if (!name) return res.status(400).json({ message: "Invalid payload" });
  const dup = await db.floorRoom.findFirst({
    where: {
      restaurantId: req.user!.restaurantId,
      name: { equals: name, mode: "insensitive" }
    }
  });
  if (dup) return res.status(409).json({ message: "Une salle avec ce nom existe déjà." });
  const room = await db.floorRoom.create({
    data: { name, restaurantId: req.user!.restaurantId, isDefault: false }
  });
  res.status(201).json(room);
});

app.patch("/floor-rooms/:id", authRequired, staffOnly, async (req, res) => {
  const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });
  const name = body.data.name.trim();
  if (!name) return res.status(400).json({ message: "Invalid payload" });

  const existing = await db.floorRoom.findFirst({
    where: { id: roomId, restaurantId: req.user!.restaurantId }
  });
  if (!existing) return res.status(404).json({ message: "Room not found" });

  const dup = await db.floorRoom.findFirst({
    where: {
      restaurantId: req.user!.restaurantId,
      name: { equals: name, mode: "insensitive" },
      NOT: { id: roomId }
    }
  });
  if (dup) return res.status(409).json({ message: "Une salle avec ce nom existe déjà." });

  const updated = await db.floorRoom.update({
    where: { id: roomId },
    data: { name }
  });
  res.json(updated);
});

app.delete("/floor-rooms/:id", authRequired, staffOnly, async (req, res) => {
  const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const restaurantId = req.user!.restaurantId;
  const existing = await db.floorRoom.findFirst({
    where: { id: roomId, restaurantId }
  });
  if (!existing) return res.status(404).json({ message: "Room not found" });
  if (existing.isDefault) {
    return res.status(403).json({
      message: "La salle principale ne peut pas être supprimée."
    });
  }
  const def = await db.floorRoom.findFirst({
    where: { restaurantId, isDefault: true, NOT: { id: roomId } }
  });
  const fallbackRoomId = def?.id ?? null;
  await db.table.updateMany({
    where: { roomId, restaurantId },
    data: { roomId: fallbackRoomId }
  });
  await db.floorRoom.delete({ where: { id: roomId } });
  res.status(204).send();
});

/** Nouveau jeton QR pour chaque table — les anciens liens / QR imprimés ne fonctionnent plus. */
app.post("/tables/regenerate-qr-tokens", authRequired, staffOnly, async (req, res) => {
  const restaurantId = req.user!.restaurantId;
  const rows = await db.table.findMany({
    where: { restaurantId },
    select: { id: true }
  });
  if (rows.length === 0) {
    return res.json([]);
  }
  await db.$transaction(
    rows.map((row) =>
      db.table.update({
        where: { id: row.id },
        data: { qrToken: randomUUID() }
      })
    )
  );
  const tables = await db.table.findMany({
    where: { restaurantId },
    orderBy: { name: "asc" }
  });
  res.json(tables);
});

app.patch("/tables/:id", authRequired, staffOnly, async (req, res) => {
  const tableId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = z
    .object({
      name: z.string().min(1).optional(),
      planPosXPct: z.number().min(0).max(100).optional(),
      planPosYPct: z.number().min(0).max(100).optional(),
      roomId: z.union([z.string().cuid(), z.null()]).optional()
    })
    .strict()
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const { name: nameRaw, planPosXPct, planPosYPct, roomId: roomIdRaw } = body.data;
  const hasName = nameRaw !== undefined;
  const hasPlanX = planPosXPct !== undefined;
  const hasPlanY = planPosYPct !== undefined;
  const hasRoomId = roomIdRaw !== undefined;
  if (!hasName && !hasPlanX && !hasPlanY && !hasRoomId) {
    return res.status(400).json({ message: "Invalid payload" });
  }
  if ((hasPlanX && !hasPlanY) || (!hasPlanX && hasPlanY)) {
    return res.status(400).json({ message: "planPosXPct et planPosYPct sont requis ensemble." });
  }

  const existing = await db.table.findFirst({
    where: { id: tableId, restaurantId: req.user!.restaurantId }
  });
  if (!existing) return res.status(404).json({ message: "Table not found" });

  let roomIdToSet: string | undefined;
  if (hasRoomId) {
    const restaurantId = req.user!.restaurantId;
    if (roomIdRaw === null) {
      const def = await db.floorRoom.findFirst({
        where: { restaurantId, isDefault: true }
      });
      if (!def) return res.status(400).json({ message: "Aucune salle par défaut." });
      roomIdToSet = def.id;
    } else {
      const roomOk = await db.floorRoom.findFirst({
        where: { id: roomIdRaw, restaurantId }
      });
      if (!roomOk) return res.status(400).json({ message: "Salle introuvable." });
      roomIdToSet = roomIdRaw;
    }
  }

  if (hasName) {
    const name = nameRaw.trim();
    if (!name) return res.status(400).json({ message: "Invalid payload" });

    const dup = await db.table.findFirst({
      where: {
        restaurantId: req.user!.restaurantId,
        name: { equals: name, mode: "insensitive" },
        NOT: { id: tableId }
      }
    });
    if (dup) return res.status(409).json({ message: "Une table avec ce nom existe déjà." });
  }

  const updated = await db.table.update({
    where: { id: tableId },
    data: {
      ...(hasName ? { name: nameRaw!.trim() } : {}),
      ...(hasPlanX && hasPlanY ? { planPosXPct, planPosYPct } : {}),
      ...(hasRoomId && roomIdToSet !== undefined ? { roomId: roomIdToSet } : {})
    }
  });
  res.json(updated);
});

app.delete("/tables/:id", authRequired, staffOnly, async (req, res) => {
  const tableId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.table.findFirst({
    where: { id: tableId, restaurantId: req.user!.restaurantId },
    include: { _count: { select: { orders: true } } }
  });
  if (!existing) return res.status(404).json({ message: "Table not found" });
  if (existing._count.orders > 0) {
    return res.status(409).json({
      message: "Impossible de supprimer cette table : des commandes y sont liées."
    });
  }

  await db.table.delete({ where: { id: tableId } });
  res.status(204).send();
});

app.get("/tables/:id/qr", authRequired, staffOnly, async (req, res) => {
  const tableId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const table = await db.table.findFirst({
    where: { id: tableId, restaurantId: req.user!.restaurantId },
    include: { restaurant: true }
  });
  if (!table) return res.status(404).json({ message: "Table not found" });

  const url = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/r/${table.restaurant.slug}/t/${table.qrToken}`;
  const png = await QRCode.toBuffer(url, { width: 320, margin: 1 });
  res.setHeader("Content-Type", "image/png");
  res.send(png);
});

app.post("/menu/categories", authRequired, staffOnly, async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const category = await db.menuCategory.create({
    data: { name: body.data.name, restaurantId: req.user!.restaurantId }
  });
  res.status(201).json(category);
});

app.patch("/menu/categories/:id", authRequired, staffOnly, async (req, res) => {
  const categoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = z
    .object({
      name: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
      position: z.number().int().optional()
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const existing = await db.menuCategory.findFirst({
    where: { id: categoryId, restaurantId: req.user!.restaurantId }
  });
  if (!existing) return res.status(404).json({ message: "Category not found" });

  const updated = await db.menuCategory.update({
    where: { id: categoryId },
    data: body.data
  });
  res.json(updated);
});

app.delete("/menu/categories/:id", authRequired, staffOnly, async (req, res) => {
  const categoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.menuCategory.findFirst({
    where: { id: categoryId, restaurantId: req.user!.restaurantId },
    include: { items: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ message: "Category not found" });

  const itemIds = existing.items.map((i) => i.id);
  const referenced = itemIds.length
    ? await db.orderItem.count({ where: { menuItemId: { in: itemIds } } })
    : 0;

  if (referenced > 0) {
    await db.$transaction([
      db.menuItem.updateMany({
        where: { categoryId: existing.id },
        data: { isActive: false }
      }),
      db.menuCategory.update({
        where: { id: existing.id },
        data: { isActive: false }
      })
    ]);
    return res.status(200).json({ softDeleted: true });
  }

  await db.menuCategory.delete({ where: { id: existing.id } });
  res.status(204).send();
});

app.post("/menu/items", authRequired, staffOnly, async (req, res) => {
  const body = z
    .object({
      categoryId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().nullable().optional(),
      tags: z.array(z.string()).optional().default([]),
      priceCents: z.number().int().positive(),
      isActive: z.boolean().optional(),
      options: z.array(z.object({ name: z.string().min(1), priceDeltaCents: z.number().int() })).default([])
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const category = await db.menuCategory.findFirst({
    where: { id: body.data.categoryId, restaurantId: req.user!.restaurantId }
  });
  if (!category) return res.status(404).json({ message: "Category not found" });

  const item = await db.menuItem.create({
    data: {
      categoryId: category.id,
      restaurantId: req.user!.restaurantId,
      name: body.data.name,
      description: body.data.description,
      imageUrl: body.data.imageUrl ?? null,
      tags: normalizeMenuItemTags(body.data.tags),
      priceCents: body.data.priceCents,
      ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
      options: {
        create: body.data.options
      }
    },
    include: { options: true }
  });
  res.status(201).json(item);
});

const menuItemOptionLine = z.object({
  name: z.string().min(1),
  priceDeltaCents: z.number().int()
});

app.patch("/menu/items/:id", authRequired, staffOnly, async (req, res) => {
  const itemId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      priceCents: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
      categoryId: z.string().min(1).optional(),
      options: z.array(menuItemOptionLine).optional()
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload", issues: body.error.issues });

  const existing = await db.menuItem.findFirst({
    where: { id: itemId, restaurantId: req.user!.restaurantId }
  });
  if (!existing) return res.status(404).json({ message: "Item not found" });

  const patch = body.data;
  if (patch.categoryId !== undefined) {
    const cat = await db.menuCategory.findFirst({
      where: { id: patch.categoryId, restaurantId: req.user!.restaurantId }
    });
    if (!cat) return res.status(400).json({ message: "Catégorie introuvable" });
  }

  const data: Prisma.MenuItemUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
  if (patch.tags !== undefined) {
    data.tags = { set: normalizeMenuItemTags(patch.tags) };
  }
  if (patch.priceCents !== undefined) data.priceCents = patch.priceCents;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.categoryId !== undefined) {
    data.category = { connect: { id: patch.categoryId } };
  }
  if (patch.options !== undefined) {
    data.options = {
      deleteMany: {},
      create: patch.options.map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents }))
    };
  }

  const updated = await db.menuItem.update({
    where: { id: itemId },
    data,
    include: { options: true }
  });
  res.json(updated);
});

app.delete("/menu/items/:id", authRequired, staffOnly, async (req, res) => {
  const itemId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.menuItem.findFirst({
    where: { id: itemId, restaurantId: req.user!.restaurantId },
    select: { id: true }
  });
  if (!existing) return res.status(404).json({ message: "Item not found" });

  const referenced = await db.orderItem.count({ where: { menuItemId: existing.id } });
  if (referenced > 0) {
    await db.menuItem.update({
      where: { id: existing.id },
      data: { isActive: false }
    });
    return res.status(200).json({ softDeleted: true });
  }

  await db.menuItem.delete({ where: { id: existing.id } });
  res.status(204).send();
});

app.get("/menu/full", authRequired, staffOnly, async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";

  const categories = await db.menuCategory.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      ...(includeInactive ? {} : { isActive: true })
    },
    orderBy: { position: "asc" },
    include: {
      items: {
        where: includeInactive ? {} : { isActive: true },
        include: { options: true },
        orderBy: { name: "asc" }
      }
    }
  });
  res.json(categories);
});

app.get("/public/r/:restaurantSlug/t/:tableToken/menu", async (req, res) => {
  const table = await db.table.findFirst({
    where: {
      qrToken: req.params.tableToken,
      restaurant: { slug: req.params.restaurantSlug }
    },
    include: { restaurant: true }
  });
  if (!table) return res.status(404).json({ message: "Invalid QR code" });
  if (table.restaurant.suspended) {
    return res.status(403).json({
      message: "Ce restaurant est temporairement indisponible."
    });
  }

  const categories = await db.menuCategory.findMany({
    where: { restaurantId: table.restaurantId, isActive: true },
    orderBy: { position: "asc" },
    include: {
      items: {
        where: { isActive: true },
        include: { options: true }
      }
    }
  });

  res.json({
    restaurant: { id: table.restaurant.id, name: table.restaurant.name, slug: table.restaurant.slug },
    table: { id: table.id, name: table.name, token: table.qrToken },
    categories
  });
});

app.post("/public/orders", async (req, res) => {
  const body = z
    .object({
      restaurantSlug: z.string().min(1),
      tableToken: z.string().min(1),
      notes: z.string().optional(),
      customerName: z.string().max(120).optional(),
      covers: z.number().int().min(1).max(99).optional(),
      fulfillmentType: z.nativeEnum(OrderFulfillmentType).optional(),
      items: z.array(
        z.object({
          menuItemId: z.string().min(1),
          quantity: z.number().int().min(1),
          optionIds: z.array(z.string()).default([])
        })
      )
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload", issues: body.error.issues });
  if (body.data.items.length === 0) return res.status(400).json({ message: "No items in order" });

  const table = await db.table.findFirst({
    where: { qrToken: body.data.tableToken, restaurant: { slug: body.data.restaurantSlug } },
    include: { restaurant: true }
  });
  if (!table) return res.status(404).json({ message: "Table not found" });
  if (table.restaurant.suspended) {
    return res.status(403).json({ message: "Ce restaurant est temporairement indisponible." });
  }

  const ids = body.data.items.map((i) => i.menuItemId);
  const menuItems = await db.menuItem.findMany({
    where: { restaurantId: table.restaurantId, id: { in: ids }, isActive: true },
    include: { options: true }
  });
  const itemById = new Map(menuItems.map((i) => [i.id, i]));

  let totalCents = 0;
  const orderLines = body.data.items.map((line) => {
    const item = itemById.get(line.menuItemId);
    if (!item) throw new Error("Invalid menu item");

    const chosenOptions = item.options.filter((opt) => line.optionIds.includes(opt.id));
    const optionsTotal = chosenOptions.reduce((acc, opt) => acc + opt.priceDeltaCents, 0);
    const unitPrice = item.priceCents + optionsTotal;
    const lineTotal = unitPrice * line.quantity;
    totalCents += lineTotal;

    return {
      quantity: line.quantity,
      unitPriceCents: unitPrice,
      lineTotalCents: lineTotal,
      nameSnapshot: item.name,
      menuItemId: item.id,
      options: chosenOptions.map((opt) => ({
        nameSnapshot: opt.name,
        priceDeltaCents: opt.priceDeltaCents
      }))
    };
  });

  const lastOrder = await db.order.findFirst({
    where: { restaurantId: table.restaurantId },
    orderBy: { orderNumber: "desc" }
  });
  const nextOrderNumber = (lastOrder?.orderNumber ?? 0) + 1;

  const order = await db.order.create({
    data: {
      restaurantId: table.restaurantId,
      tableId: table.id,
      orderNumber: nextOrderNumber,
      totalCents,
      notes: body.data.notes,
      customerName: body.data.customerName?.trim() || null,
      covers: body.data.covers ?? null,
      fulfillmentType: body.data.fulfillmentType ?? OrderFulfillmentType.DINE_IN,
      items: {
        create: orderLines.map((line) => ({
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          nameSnapshot: line.nameSnapshot,
          menuItemId: line.menuItemId,
          options: { create: line.options }
        }))
      }
    },
    include: { items: { include: { options: true } }, table: true }
  });

  io.to(`restaurant:${table.restaurantId}`).emit("order.created", order);
  io.to(`order:${order.id}`).emit("order.updated", { id: order.id, status: order.status });

  res.status(201).json(order);
});

app.get("/public/orders/:id/status", async (req, res) => {
  const order = await db.order.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, orderNumber: true }
  });
  if (!order) return res.status(404).json({ message: "Order not found" });
  res.json(order);
});

app.get("/kitchen/orders", authRequired, async (req, res) => {
  const includeRecentServed = req.query.includeRecentServed === "true";
  const recentMinutes = Number(req.query.recentMinutes) || 30;

  const activeStatuses: OrderStatus[] = [
    OrderStatus.PLACED,
    OrderStatus.PREPARING,
    OrderStatus.READY
  ];

  const active = await db.order.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      status: { in: activeStatuses }
    },
    include: {
      table: true,
      items: { include: { options: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!includeRecentServed) {
    return res.json(active);
  }

  const since = new Date(Date.now() - recentMinutes * 60 * 1000);
  const recentServed = await db.order.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      status: OrderStatus.SERVED,
      /* Fenêtre basée sur la dernière maj (ex. passage en Servi), pas sur la création de la commande */
      updatedAt: { gte: since }
    },
    include: {
      table: true,
      items: { include: { options: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 12
  });

  res.json([...active, ...recentServed]);
});

app.get("/orders/history", authRequired, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const tableId = typeof req.query.tableId === "string" ? req.query.tableId : undefined;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  const statusFilter =
    status && Object.values(OrderStatus).includes(status as OrderStatus)
      ? (status as OrderStatus)
      : undefined;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) dateFilter.gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) dateFilter.lte = parsed;
  }

  const orders = await db.order.findMany({
    where: {
      restaurantId: req.user!.restaurantId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(tableId ? { tableId } : {}),
      ...(dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {})
    },
    include: {
      table: true,
      items: { include: { options: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  res.json(orders);
});

/** Tables avec commandes servies non encaissées (caisse). */
app.get("/caisse/tables-overview", authRequired, staffOnly, async (req, res) => {
  const rid = req.user!.restaurantId;
  const rows = await db.order.groupBy({
    by: ["tableId"],
    where: {
      restaurantId: rid,
      status: OrderStatus.SERVED,
      billId: null
    },
    _sum: { totalCents: true },
    _count: { id: true }
  });
  if (rows.length === 0) {
    res.json([]);
    return;
  }
  const tables = await db.table.findMany({
    where: { restaurantId: rid, id: { in: rows.map((r) => r.tableId) } },
    select: { id: true, name: true }
  });
  const byId = new Map(tables.map((t) => [t.id, t.name]));
  res.json(
    rows.map((r) => ({
      tableId: r.tableId,
      tableName: byId.get(r.tableId) ?? "Table",
      unpaidOrderCount: r._count.id,
      unpaidTotalCents: r._sum.totalCents ?? 0
    }))
  );
});

/** Détail des commandes à encaisser pour une table. */
app.get("/caisse/tables/:tableId/unpaid", authRequired, staffOnly, async (req, res) => {
  const tableId = Array.isArray(req.params.tableId) ? req.params.tableId[0] : req.params.tableId;
  const rid = req.user!.restaurantId;
  const table = await db.table.findFirst({
    where: { id: tableId, restaurantId: rid },
    select: { id: true, name: true }
  });
  if (!table) return res.status(404).json({ message: "Table introuvable." });

  const orders = await db.order.findMany({
    where: {
      restaurantId: rid,
      tableId,
      status: OrderStatus.SERVED,
      billId: null
    },
    include: {
      table: true,
      items: { include: { options: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  const unpaidTotalCents = orders.reduce((s, o) => s + o.totalCents, 0);
  res.json({ table, orders, unpaidTotalCents });
});

const billInclude = {
  table: { select: { id: true, name: true } },
  restaurant: {
    select: {
      name: true,
      slug: true,
      currency: true,
      legalName: true,
      addressLine1: true,
      addressLine2: true,
      postalCode: true,
      city: true,
      country: true,
      phone: true,
      billingEmail: true,
      siret: true,
      vatNumber: true,
      logoUrl: true,
      invoiceFooterLegal: true,
      vatMode: true
    }
  },
  registeredBy: { select: { email: true } },
  orders: {
    include: {
      table: true,
      items: { include: { options: true } }
    },
    orderBy: { createdAt: "asc" as const }
  }
} satisfies Prisma.BillInclude;

/** Crée une facture / ticket et rattache les commandes (servies, non encaissées). */
app.post("/caisse/bills", authRequired, staffOnly, async (req, res) => {
  const body = z
    .object({
      tableId: z.string().min(1),
      orderIds: z.array(z.string()).min(1),
      paymentMethod: z.nativeEnum(PaymentMethod),
      tipCents: z.number().int().min(0).max(99_999_999).optional(),
      processorFeeCents: z.number().int().min(0).max(99_999_999).optional()
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const { tableId, orderIds, paymentMethod, tipCents, processorFeeCents } = body.data;
  const rid = req.user!.restaurantId;
  const userId = req.user!.userId;

  const table = await db.table.findFirst({
    where: { id: tableId, restaurantId: rid },
    select: { id: true }
  });
  if (!table) return res.status(404).json({ message: "Table introuvable." });

  const orders = await db.order.findMany({
    where: {
      id: { in: orderIds },
      restaurantId: rid,
      tableId,
      status: OrderStatus.SERVED,
      billId: null
    },
    select: { id: true, totalCents: true }
  });

  if (orders.length !== orderIds.length) {
    return res.status(400).json({
      message:
        "Certaines commandes sont introuvables, déjà encaissées, ou ne sont pas au statut « Servi » sur cette table."
    });
  }

  const totalCents = orders.reduce((s, o) => s + o.totalCents, 0);

  try {
    const bill = await db.$transaction(async (tx) => {
      const maxInv = await tx.bill.aggregate({
        where: { restaurantId: rid },
        _max: { invoiceNumber: true }
      });
      const invoiceNumber = (maxInv._max.invoiceNumber ?? 0) + 1;

      let paymentReference = uniquePaymentReference();
      for (let attempt = 0; attempt < 6; attempt++) {
        const clash = await tx.bill.findUnique({ where: { paymentReference }, select: { id: true } });
        if (!clash) break;
        paymentReference = uniquePaymentReference();
      }

      const publicViewToken = randomUUID();
      const cashier = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      const registeredByLabel = cashier?.email ?? null;

      const created = await tx.bill.create({
        data: {
          restaurantId: rid,
          tableId,
          invoiceNumber,
          totalCents,
          paymentMethod,
          registeredByUserId: userId,
          paymentReference,
          publicViewToken,
          registeredByLabel,
          tipCents: tipCents ?? 0,
          processorFeeCents: processorFeeCents ?? 0
        }
      });

      const { count } = await tx.order.updateMany({
        where: {
          id: { in: orderIds },
          restaurantId: rid,
          tableId,
          status: OrderStatus.SERVED,
          billId: null
        },
        data: { billId: created.id }
      });

      if (count !== orderIds.length) {
        throw new Error("CONFLICT_UPDATE");
      }

      return tx.bill.findUniqueOrThrow({
        where: { id: created.id },
        include: billInclude
      });
    });

    void writeAccountingAudit({
      restaurantId: rid,
      userId,
      action: "BILL_CREATED",
      entityType: "Bill",
      entityId: bill.id,
      detail: `Facture n° ${bill.invoiceNumber} — ${(bill.totalCents / 100).toFixed(2)} € — ${paymentMethod}`
    });

    res.status(201).json(bill);
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT_UPDATE") {
      return res.status(409).json({ message: "Encaissement impossible : commandes modifiées entre-temps." });
    }
    console.error(e);
    return res.status(500).json({ message: "Erreur lors de l’encaissement." });
  }
});

/** Liste des factures sur une période (compta / export). */
app.get("/caisse/bills", authRequired, staffOnly, async (req, res) => {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
  const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!fromRaw || !toRaw) {
    return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  const rid = req.user!.restaurantId;
  const bills = await db.bill.findMany({
    where: {
      restaurantId: rid,
      createdAt: { gte: from, lte: to }
    },
    include: {
      table: { select: { id: true, name: true } },
      orders: { select: { id: true, orderNumber: true, totalCents: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  res.json(bills);
});

/** Détail facture (aperçu / impression). */
app.get("/caisse/bills/:id", authRequired, staffOnly, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const bill = await db.bill.findFirst({
    where: { id, restaurantId: req.user!.restaurantId },
    include: billInclude
  });
  if (!bill) return res.status(404).json({ message: "Facture introuvable." });
  res.json(bill);
});

/** Consultation publique d’une facture (QR code, lien court). */
app.get("/public/bills/:token", async (req, res) => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  if (!token?.trim()) return res.status(400).json({ message: "Token requis." });
  const bill = await db.bill.findFirst({
    where: { publicViewToken: token.trim() },
    include: billInclude
  });
  if (!bill) return res.status(404).json({ message: "Facture introuvable ou lien expiré." });
  const { registeredBy: _rb, ...safe } = bill;
  res.json({ ...safe, registeredBy: null });
});

/** Totaux encaissés par mode de paiement (compta). */
app.get("/caisse/summary", authRequired, staffOnly, async (req, res) => {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
  const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!fromRaw || !toRaw) {
    return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  const rid = req.user!.restaurantId;
  const bills = await db.bill.findMany({
    where: { restaurantId: rid, createdAt: { gte: from, lte: to } },
    select: { totalCents: true, paymentMethod: true }
  });

  const byPaymentMethod: Record<PaymentMethod, number> = {
    CASH: 0,
    CARD: 0,
    OTHER: 0
  };
  let totalCents = 0;
  for (const b of bills) {
    totalCents += b.totalCents;
    byPaymentMethod[b.paymentMethod] += b.totalCents;
  }

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    computedAt: new Date().toISOString(),
    billCount: bills.length,
    totalCents,
    byPaymentMethod
  });
});

/** Agrégats pour la vue « Pilotage » (CA, volumes, répartition) — plage en ISO côté client (fuseau du navigateur). */
app.get("/dashboard/analytics", authRequired, staffOnly, async (req, res) => {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
  const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;
  if (!fromRaw || !toRaw) {
    return res.status(400).json({ message: "Query params `from` and `to` (ISO 8601) are required" });
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  const rid = req.user!.restaurantId;
  const dateWhere = { gte: from, lte: to };
  const baseWhere = { restaurantId: rid, createdAt: dateWhere };
  const commerceWhere = { ...baseWhere, status: { not: OrderStatus.CANCELLED } };
  const orderItemCommerceFilter = {
    order: {
      restaurantId: rid,
      createdAt: dateWhere,
      status: { not: OrderStatus.CANCELLED }
    }
  };

  /* Tables où il y a eu une commande non annulée créée OU mise à jour sur la période (sinon une seule table si tu ne fais que valider d'anciennes commandes). */
  const tablesActivityWhere = {
    restaurantId: rid,
    status: { not: OrderStatus.CANCELLED },
    OR: [{ createdAt: dateWhere }, { updatedAt: dateWhere }]
  };

  const [orderCount, lineAgg, headerAgg, statusGroups, distinctTableRows, itemRows] = await Promise.all([
    db.order.count({ where: commerceWhere }),
    db.orderItem.aggregate({
      where: orderItemCommerceFilter,
      _sum: { lineTotalCents: true },
      _count: { id: true }
    }),
    db.order.aggregate({
      where: commerceWhere,
      _sum: { totalCents: true }
    }),
    db.order.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { id: true }
    }),
    db.order.findMany({
      where: tablesActivityWhere,
      select: { tableId: true },
      distinct: ["tableId"]
    }),
    db.orderItem.findMany({
      where: orderItemCommerceFilter,
      select: { nameSnapshot: true, quantity: true, lineTotalCents: true }
    })
  ]);

  /* CA = somme réelle des lignes article (hors annulées). Totaux commande également renvoyés pour contrôle. */
  const revenueCents = lineAgg._sum.lineTotalCents ?? 0;
  const revenueOrderHeaderCents = headerAgg._sum.totalCents ?? 0;
  const totalsMismatchCents = Math.abs(revenueCents - revenueOrderHeaderCents);
  const lineItemsCount = lineAgg._count.id;

  const distinctTablesWithOrders = distinctTableRows.length;

  const byName = new Map<string, { qty: number; revenueCents: number }>();
  for (const row of itemRows) {
    const cur = byName.get(row.nameSnapshot) ?? { qty: 0, revenueCents: 0 };
    cur.qty += row.quantity;
    cur.revenueCents += row.lineTotalCents;
    byName.set(row.nameSnapshot, cur);
  }
  const topItems = [...byName.entries()]
    .map(([name, v]) => ({ name, quantitySold: v.qty, revenueCents: v.revenueCents }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  let nonCancelledCount = 0;
  let servedCount = 0;
  let cancelledCount = 0;
  for (const g of statusGroups) {
    if (g.status === OrderStatus.CANCELLED) cancelledCount = g._count.id;
    else nonCancelledCount += g._count.id;
    if (g.status === OrderStatus.SERVED) servedCount = g._count.id;
  }
  const servedRate =
    nonCancelledCount > 0 ? Math.round((1000 * servedCount) / nonCancelledCount) / 1000 : null;

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    computedAt: new Date().toISOString(),
    revenueCents,
    revenueOrderHeaderCents,
    totalsMismatchCents,
    lineItemsCount,
    orderCount,
    averageBasketCents: orderCount > 0 ? Math.round(revenueCents / orderCount) : 0,
    distinctTablesWithOrders,
    cancelledOrders: cancelledCount,
    servedOrders: servedCount,
    servedRate,
    byStatus: statusGroups.map((g) => ({ status: g.status, count: g._count.id })),
    topItems
  });
});

app.patch("/kitchen/orders/:id/status", authRequired, async (req, res) => {
  const body = z.object({ status: z.nativeEnum(OrderStatus) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });
  const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existingOrder = await db.order.findFirst({
    where: { id: orderId, restaurantId: req.user!.restaurantId },
    select: { id: true, status: true }
  });
  if (!existingOrder) return res.status(404).json({ message: "Order not found" });

  const nextStatus = body.data.status;
  const prevStatus = existingOrder.status;

  const prepData: { preparingStartedAt?: Date | null } = {};
  if (nextStatus === OrderStatus.PREPARING && prevStatus !== OrderStatus.PREPARING) {
    prepData.preparingStartedAt = new Date();
  } else if (nextStatus === OrderStatus.PLACED) {
    prepData.preparingStartedAt = null;
  }

  const updated = await db.order.update({
    where: { id: orderId },
    data: { status: nextStatus, ...prepData },
    include: { table: true, items: { include: { options: true } } }
  });

  if (prevStatus !== nextStatus) {
    void writeAccountingAudit({
      restaurantId: updated.restaurantId,
      userId: req.user!.userId,
      action: "ORDER_STATUS",
      entityType: "Order",
      entityId: orderId,
      detail: `Commande #${updated.orderNumber} : ${prevStatus} → ${nextStatus}`
    });
  }

  io.to(`restaurant:${updated.restaurantId}`).emit("order.updated", updated);
  io.to(`order:${updated.id}`).emit("order.updated", { id: updated.id, status: updated.status });

  res.json(updated);
});

const port = Number(process.env.API_PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
