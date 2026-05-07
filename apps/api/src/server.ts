import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import QRCode from "qrcode";
import { Server } from "socket.io";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { authRequired, signAuthToken } from "./auth.js";
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

app.get("/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

app.post("/auth/register", async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(6),
      restaurantName: z.string().min(2)
    })
    .safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ message: "Invalid payload", issues: body.error.issues });
  }

  const email = body.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(body.data.password, 10);
  const baseSlug = slugify(body.data.restaurantName);
  const slug = `${baseSlug}-${Math.floor(Math.random() * 10_000)}`;

  try {
    const data = await db.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { name: body.data.restaurantName, slug }
      });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "OWNER",
          restaurantId: restaurant.id
        }
      });
      return { user, restaurant };
    });

    const token = signAuthToken({
      userId: data.user.id,
      restaurantId: data.restaurant.id,
      role: data.user.role
    });

    return res.status(201).json({ token, restaurant: data.restaurant, userId: data.user.id });
  } catch {
    return res.status(409).json({ message: "Email already used" });
  }
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

  const user = await db.user.findUnique({
    where: { email: body.data.email.toLowerCase() },
    include: { restaurant: true }
  });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const isValid = await bcrypt.compare(body.data.password, user.passwordHash);
  if (!isValid) return res.status(401).json({ message: "Invalid credentials" });

  const token = signAuthToken({
    userId: user.id,
    restaurantId: user.restaurantId,
    role: user.role
  });

  return res.json({
    token,
    restaurant: {
      id: user.restaurant.id,
      name: user.restaurant.name,
      slug: user.restaurant.slug
    }
  });
});

app.get("/me/restaurant", authRequired, async (req, res) => {
  const restaurant = await db.restaurant.findUnique({
    where: { id: req.user!.restaurantId }
  });
  res.json(restaurant);
});

app.post("/tables", authRequired, async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const table = await db.table.create({
    data: {
      name: body.data.name,
      qrToken: randomUUID(),
      restaurantId: req.user!.restaurantId
    }
  });

  res.status(201).json(table);
});

app.get("/tables", authRequired, async (req, res) => {
  const tables = await db.table.findMany({
    where: { restaurantId: req.user!.restaurantId },
    orderBy: { name: "asc" }
  });
  res.json(tables);
});

app.get("/tables/:id/qr", authRequired, async (req, res) => {
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

app.post("/menu/categories", authRequired, async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });

  const category = await db.menuCategory.create({
    data: { name: body.data.name, restaurantId: req.user!.restaurantId }
  });
  res.status(201).json(category);
});

app.patch("/menu/categories/:id", authRequired, async (req, res) => {
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

app.delete("/menu/categories/:id", authRequired, async (req, res) => {
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

app.post("/menu/items", authRequired, async (req, res) => {
  const body = z
    .object({
      categoryId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().nullable().optional(),
      priceCents: z.number().int().positive(),
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
      priceCents: body.data.priceCents,
      options: {
        create: body.data.options
      }
    },
    include: { options: true }
  });
  res.status(201).json(item);
});

app.patch("/menu/items/:id", authRequired, async (req, res) => {
  const itemId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      priceCents: z.number().int().positive().optional(),
      isActive: z.boolean().optional()
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload", issues: body.error.issues });

  const existing = await db.menuItem.findFirst({
    where: { id: itemId, restaurantId: req.user!.restaurantId }
  });
  if (!existing) return res.status(404).json({ message: "Item not found" });

  const updated = await db.menuItem.update({
    where: { id: itemId },
    data: body.data,
    include: { options: true }
  });
  res.json(updated);
});

app.delete("/menu/items/:id", authRequired, async (req, res) => {
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

app.get("/menu/full", authRequired, async (req, res) => {
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
  const recentMinutes = Number(req.query.recentMinutes) || 60;

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
      createdAt: { gte: since }
    },
    include: {
      table: true,
      items: { include: { options: true } }
    },
    orderBy: { createdAt: "desc" },
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

app.patch("/kitchen/orders/:id/status", authRequired, async (req, res) => {
  const body = z.object({ status: z.nativeEnum(OrderStatus) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Invalid payload" });
  const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db.order.findFirst({
    where: { id: orderId, restaurantId: req.user!.restaurantId },
    select: { id: true }
  });
  if (!existing) return res.status(404).json({ message: "Order not found" });

  const updated = await db.order.update({
    where: { id: orderId },
    data: { status: body.data.status },
    include: { table: true, items: { include: { options: true } } }
  });

  io.to(`restaurant:${updated.restaurantId}`).emit("order.updated", updated);
  io.to(`order:${updated.id}`).emit("order.updated", { id: updated.id, status: updated.status });

  res.json(updated);
});

const port = Number(process.env.API_PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
