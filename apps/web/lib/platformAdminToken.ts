import "./monorepoEnv";
import jwt from "jsonwebtoken";
import { superAdminSessionSecret } from "./superAdminSessionSecret";

export function verifyPlatformAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const d = jwt.verify(token, superAdminSessionSecret()) as Record<string, unknown>;
    return d.typ === "platform_admin" && typeof d.adminId === "string";
  } catch {
    return false;
  }
}
