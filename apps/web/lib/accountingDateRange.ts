export type AccountingPeriodPreset = "day" | "week" | "month" | "custom";

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function rangeForAccountingPreset(
  preset: AccountingPeriodPreset,
  customFrom?: Date | null,
  customTo?: Date | null
): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "custom" && customFrom && customTo) {
    return { from: startOfLocalDay(customFrom), to: endOfLocalDay(customTo) };
  }
  if (preset === "day") return { from: startOfLocalDay(now), to: now };
  if (preset === "week") return { from: startOfWeekMonday(now), to: now };
  return { from: startOfMonth(now), to: now };
}
