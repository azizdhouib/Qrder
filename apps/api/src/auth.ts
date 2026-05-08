import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db.js";

export type AuthUser = {
  userId: string;
  restaurantId: string;
  role: "OWNER" | "MANAGER" | "KITCHEN";
};

export type PlatformAdminJwtPayload = {
  typ: "platform_admin";
  adminId: string;
};

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "change-me";
}

export function signAuthToken(payload: AuthUser) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: "7d" });
}

export function signPlatformAdminToken(adminId: string) {
  const payload: PlatformAdminJwtPayload = { typ: "platform_admin", adminId };
  return jwt.sign(payload, jwtSecret(), { expiresIn: "7d" });
}

/** Vérifie un JWT émis pour la console plateforme (pas un token staff restaurant). */
export function verifyPlatformAdminToken(token: string): PlatformAdminJwtPayload | null {
  try {
    const raw = jwt.verify(token, jwtSecret());
    if (typeof raw !== "object" || raw === null) return null;
    const d = raw as Record<string, unknown>;
    if (d.typ !== "platform_admin" || typeof d.adminId !== "string") return null;
    return { typ: "platform_admin", adminId: d.adminId };
  } catch {
    return null;
  }
}

/** Restreint aux rôles listés (après `authRequired`). */
export function requireRoles(...allowed: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Missing auth" });
    }
    if (!allowed.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden for this role" });
    }
    next();
  };
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret()) as AuthUser;
      const restaurant = await db.restaurant.findUnique({
        where: { id: decoded.restaurantId },
        select: { suspended: true }
      });
      if (!restaurant || restaurant.suspended) {
        res.status(403).json({
          message: "Établissement suspendu ou indisponible. Contacte l’administrateur."
        });
        return;
      }
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ message: "Invalid auth token" });
    }
  })().catch(() => {
    res.status(500).json({ message: "Auth error" });
  });
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      platformAdmin?: { id: string; email: string };
    }
  }
}
