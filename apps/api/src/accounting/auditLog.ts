import { db } from "../db.js";

export async function writeAccountingAudit(opts: {
  restaurantId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail: string;
}): Promise<void> {
  try {
    await db.accountingAuditLog.create({
      data: {
        restaurantId: opts.restaurantId,
        userId: opts.userId,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId ?? null,
        detail: opts.detail
      }
    });
  } catch (e) {
    console.error("[accounting-audit]", e);
  }
}
