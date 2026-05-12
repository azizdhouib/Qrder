import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** Schéma IndexedDB Qrder — hors ligne (snapshots + file d’attente). */
export interface QrderOfflineDB extends DBSchema {
  meta: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
  snapshots: {
    key: string;
    value: { key: string; data: unknown; updatedAt: number };
  };
  outbox: {
    key: string;
    value: OutboxRecord;
  };
}

export type OutboxRecord = {
  id: string;
  type: "kitchen_status";
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  payload: unknown;
};

const DB_NAME = "qrder-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<QrderOfflineDB>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<QrderOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QrderOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("snapshots")) {
          db.createObjectStore("snapshots", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
      }
    });
  }
  return dbPromise;
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  const db = await getOfflineDb();
  await db.put("meta", { key, value, updatedAt: Date.now() });
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
  const db = await getOfflineDb();
  const row = await db.get("meta", key);
  return row?.value as T | undefined;
}

export async function metaDelete(key: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("meta", key);
}

export async function snapshotPut(key: string, data: unknown): Promise<void> {
  const db = await getOfflineDb();
  await db.put("snapshots", { key, data, updatedAt: Date.now() });
}

export async function snapshotGet<T>(key: string): Promise<T | null> {
  const db = await getOfflineDb();
  const row = await db.get("snapshots", key);
  return row ? (row.data as T) : null;
}

export async function outboxAdd(record: Omit<OutboxRecord, "attempts" | "nextAttemptAt">): Promise<void> {
  const db = await getOfflineDb();
  const full: OutboxRecord = {
    ...record,
    attempts: 0,
    nextAttemptAt: 0
  };
  await db.put("outbox", full);
}

export async function outboxAll(): Promise<OutboxRecord[]> {
  const db = await getOfflineDb();
  return db.getAll("outbox");
}

export async function outboxDelete(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("outbox", id);
}

export async function outboxUpdate(record: OutboxRecord): Promise<void> {
  const db = await getOfflineDb();
  await db.put("outbox", record);
}

export async function outboxCount(): Promise<number> {
  const db = await getOfflineDb();
  return db.count("outbox");
}
