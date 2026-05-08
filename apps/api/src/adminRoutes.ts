import { randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router, type NextFunction, type Request, type Response } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { signPlatformAdminToken, verifyPlatformAdminToken } from "./auth.js";
import { db } from "./db.js";

const MIN_ADMIN_KEY_LEN = 16;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateTempPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(16);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[buf[i]! % alphabet.length]!;
  }
  return out;
}

function adminKeyMatches(expected: string, provided: string): boolean {
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    try {
      const authHeader = req.headers.authorization;
      const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      const headerKey = req.header("x-admin-key")?.trim();

      if (bearer) {
        const plat = verifyPlatformAdminToken(bearer);
        if (plat) {
          const admin = await db.platformAdmin.findUnique({ where: { id: plat.adminId } });
          if (admin) {
            req.platformAdmin = { id: admin.id, email: admin.email };
            next();
            return;
          }
        }
      }

      const expected = process.env.ADMIN_API_KEY ?? "";
      const keyConfigured = expected.length >= MIN_ADMIN_KEY_LEN;
      const providedKey = headerKey || bearer || "";
      if (keyConfigured && providedKey && adminKeyMatches(expected, providedKey)) {
        next();
        return;
      }

      res.status(401).json({ message: "Authentification administrateur invalide ou absente." });
    } catch (err) {
      next(err);
    }
  })().catch(next);
}

export function createAdminRouter(): Router {
  const r = Router();

  r.post("/auth/login", async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1)
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: "Payload invalide", issues: body.error.issues });
    }

    const email = body.data.email.toLowerCase();
    const admin = await db.platformAdmin.findUnique({ where: { email } });
    if (!admin) {
      return res.status(401).json({ message: "Identifiants incorrects." });
    }
    const ok = await bcrypt.compare(body.data.password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Identifiants incorrects." });
    }

    const token = signPlatformAdminToken(admin.id);
    return res.json({ token, email: admin.email });
  });

  r.use(adminAuthMiddleware);

  r.get("/restaurants", async (_req, res) => {
    const rows = await db.restaurant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        suspended: true,
        createdAt: true,
        _count: { select: { users: true } }
      },
      orderBy: { name: "asc" }
    });
    res.json(rows);
  });

  /** Restaurants avec tous les comptes équipe (sans secret) — console super admin. */
  r.get("/directory", async (_req, res) => {
    const rows = await db.restaurant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        suspended: true,
        createdAt: true,
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true
          },
          orderBy: [{ role: "asc" }, { email: "asc" }]
        }
      },
      orderBy: { name: "asc" }
    });
    res.json(rows);
  });

  r.post("/restaurants", async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        ownerEmail: z.string().email(),
        ownerPassword: z.string().min(6),
        currency: z.string().length(3).optional().default("EUR")
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: "Payload invalide", issues: body.error.issues });
    }

    const email = body.data.ownerEmail.toLowerCase();
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }

    let slug =
      body.data.slug ?? `${slugify(body.data.name)}-${Math.floor(Math.random() * 100_000)}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = await db.restaurant.findUnique({ where: { slug } });
      if (!clash) break;
      slug = `${slugify(body.data.name)}-${Math.floor(Math.random() * 1_000_000)}`;
    }

    const passwordHash = await bcrypt.hash(body.data.ownerPassword, 10);

    try {
      const result = await db.$transaction(async (tx) => {
        const restaurant = await tx.restaurant.create({
          data: {
            name: body.data.name,
            slug,
            currency: body.data.currency,
            suspended: false
          }
        });
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            role: UserRole.OWNER,
            restaurantId: restaurant.id
          }
        });
        return { restaurant, user };
      });

      return res.status(201).json({
        restaurant: {
          id: result.restaurant.id,
          name: result.restaurant.name,
          slug: result.restaurant.slug,
          currency: result.restaurant.currency,
          suspended: result.restaurant.suspended
        },
        owner: { id: result.user.id, email: result.user.email, role: result.user.role }
      });
    } catch {
      return res.status(409).json({ message: "Slug ou contrainte unique en conflit." });
    }
  });

  r.post("/users", async (req, res) => {
    const body = z
      .object({
        restaurantId: z.string().min(1).optional(),
        restaurantSlug: z.string().min(1).optional(),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.nativeEnum(UserRole)
      })
      .refine((d) => Boolean(d.restaurantId || d.restaurantSlug), {
        message: "restaurantId ou restaurantSlug requis"
      })
      .safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: "Payload invalide", issues: body.error.issues });
    }

    const email = body.data.email.toLowerCase();
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }

    let restaurant = null as Awaited<ReturnType<typeof db.restaurant.findUnique>>;
    if (body.data.restaurantId) {
      restaurant = await db.restaurant.findUnique({ where: { id: body.data.restaurantId } });
    } else if (body.data.restaurantSlug) {
      restaurant = await db.restaurant.findUnique({ where: { slug: body.data.restaurantSlug } });
    }
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }
    if (restaurant.suspended) {
      return res.status(403).json({
        message: "Restaurant suspendu — impossible d’ajouter un utilisateur pour cet établissement."
      });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10);
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        role: body.data.role,
        restaurantId: restaurant.id
      }
    });

    return res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role },
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug }
    });
  });

  r.patch("/restaurants/:id", async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = z.object({ suspended: z.boolean() }).safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: "Payload invalide", issues: body.error.issues });
    }
    try {
      await db.restaurant.update({
        where: { id },
        data: { suspended: body.data.suspended }
      });
    } catch {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }
    const restaurant = await db.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        suspended: true,
        createdAt: true
      }
    });
    res.json(restaurant);
  });

  /** Définit un nouveau mot de passe généré et le renvoie une seule fois (support super admin). */
  r.post("/users/:userId/reset-password", async (req, res) => {
    const userIdRaw = req.params.userId;
    const userId = Array.isArray(userIdRaw) ? userIdRaw[0] : userIdRaw;
    if (!userId?.trim()) {
      return res.status(400).json({ message: "Identifiant utilisateur requis." });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, restaurantId: true }
    });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    const plain = generateTempPassword();
    const passwordHash = await bcrypt.hash(plain, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    return res.json({
      userId: user.id,
      email: user.email,
      role: user.role,
      password: plain
    });
  });

  r.delete("/restaurants/:id", async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await db.restaurant.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }
    await db.$transaction(async (tx) => {
      await tx.order.deleteMany({ where: { restaurantId: id } });
      await tx.restaurant.delete({ where: { id } });
    });
    res.status(204).send();
  });

  /** Santé de la config admin (sans données sensibles). */
  r.get("/ping", (_req, res) => {
    res.json({ ok: true, admin: "configured" });
  });

  return r;
}
