import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

export type AuthUser = {
  userId: string;
  restaurantId: string;
  role: "OWNER" | "MANAGER" | "KITCHEN";
};

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";

export function signAuthToken(payload: AuthUser) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing auth token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid auth token" });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
