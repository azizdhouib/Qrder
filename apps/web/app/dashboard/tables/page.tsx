"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { API_URL, apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";
import {
  AlertTriangle,
  Building2,
  Download,
  Pencil,
  QrCode,
  RefreshCw,
  X
} from "lucide-react";

/** Zoom zone du plan : min = ancien 140 % (taille de salle « compacte »), au‑dessus = plus d’espace vertical. */
const LS_TABLES_PLAN_ZOOM = "tablesPilotPlanZoomPct_v2";
const LS_TABLES_PLAN_ZOOM_LEGACY = "tablesPilotPlanZoomPct_v1";
const PLAN_ZOOM_MIN_PCT = 140;
const PLAN_ZOOM_MAX_PCT = 500;
const LS_TABLES_CARD_SCALE = "tablesPilotCardScalePct_v1";
/** Déplacement en pixels toléré pour considérer un « clic » (sans glisser). */
const FLOOR_TAP_MAX_PX = 12;
/** Au‑delà de ce déplacement en % sur le plan, on considère un glissement (pas d’ouverture de la modale). */
const FLOOR_DRAG_MIN_PCT = 0.12;
/** Durée max. entre appui et relâchement pour compter comme un clic simple (évite ouvrir la modale au maintien long). */
const FLOOR_CLICK_MAX_MS = 420;

type FloorRoom = { id: string; name: string; isDefault: boolean };

type Table = {
  id: string;
  name: string;
  qrToken: string;
  planPosXPct?: number | null;
  planPosYPct?: number | null;
  roomId?: string | null;
};

type MeResponse = {
  userId: string;
  role: string;
  restaurant: { id: string; name: string; slug: string; currency: string; suspended: boolean };
};

type OrderStatus = "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";

type KitchenOrder = {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  createdAt: string;
  notes: string | null;
  table: { id: string; name: string };
  items: {
    id: string;
    nameSnapshot: string;
    quantity: number;
    options: { id: string; nameSnapshot: string }[];
  }[];
};

const ORDER_STATUS_FR: Record<OrderStatus, string> = {
  PLACED: "Nouvelle",
  PREPARING: "En préparation",
  READY: "Prête",
  SERVED: "Servie",
  CANCELLED: "Annulée"
};

type AnalyticsResponse = {
  from: string;
  to: string;
  revenueCents: number;
  orderCount: number;
  averageBasketCents: number;
  distinctTablesWithOrders: number;
  topItems: { name: string; quantitySold: number; revenueCents: number }[];
};

type CaisseTableOverviewRow = {
  tableId: string;
  tableName: string;
  unpaidOrderCount: number;
  unpaidTotalCents: number;
};

type FloorKey = "libre" | "salle" | "cuisine" | "servir";

const FLOOR_LABEL: Record<FloorKey, string> = {
  libre: "LIBRE",
  salle: "EN SALLE",
  cuisine: "CUISINE",
  servir: "À SERVIR"
};

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function greetingWord(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 18) return "Bonjour";
  return "Bonsoir";
}

function floorKeyForTable(
  tableId: string,
  orders: KitchenOrder[],
  tablesWithUnpaidServed: ReadonlySet<string>
): FloorKey {
  if (tablesWithUnpaidServed.has(tableId)) return "salle";
  const active = orders.filter(
    (o) => o.table.id === tableId && (o.status === "PLACED" || o.status === "PREPARING" || o.status === "READY")
  );
  if (active.length === 0) return "libre";
  /* Tant que la table n’est pas libérée par l’encaissement : tout le service reste « en salle » (bleu), pas cuisine / à servir. */
  return "salle";
}

function tableNameTaken(tables: Table[], name: string, excludeTableId?: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return tables.some((t) => t.name.trim().toLowerCase() === n && (!excludeTableId || t.id !== excludeTableId));
}

function clampFloorPct(v: number) {
  return Math.min(94, Math.max(6, v));
}

/** Placement par défaut (grille) tant que la table n’a pas de coordonnées enregistrées. */
function defaultPlanPct(index: number, total: number): { x: number; y: number } {
  if (total <= 0) return { x: 50, y: 50 };
  const cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(total))));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const margin = 10;
  const span = 100 - 2 * margin;
  const x = margin + ((col + 0.5) / cols) * span;
  const y = margin + ((row + 0.5) / rows) * span;
  return { x, y };
}

function planPctForTable(table: Table, index: number, total: number): { x: number; y: number } {
  if (table.planPosXPct != null && table.planPosYPct != null) {
    return { x: table.planPosXPct, y: table.planPosYPct };
  }
  return defaultPlanPct(index, total);
}

/** Regroupe des valeurs proches (évite des doublons de guides). */
function uniqNearSorted(values: number[], eps = 0.12): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (!out.length || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
  }
  return out;
}

function pairMidpoints(values: number[]): number[] {
  const u = uniqNearSorted(values, 0.18);
  const mids: number[] = [];
  for (let i = 0; i < u.length; i++) {
    for (let j = i + 1; j < u.length; j++) {
      mids.push((u[i] + u[j]) / 2);
    }
  }
  return mids;
}

/** Cibles de magnétisme façon éditeur : autres tables, centre, grille, milieux, symétrie. */
function buildFloorSnapCandidates(
  axis: "x" | "y",
  sortedTables: Table[],
  excludeId: string,
  total: number
): number[] {
  const centers: number[] = [];
  sortedTables.forEach((t, idx) => {
    if (t.id === excludeId) return;
    const p = planPctForTable(t, idx, total);
    centers.push(axis === "x" ? p.x : p.y);
  });
  const GRID = [10, 16.66, 20, 25, 33.33, 40, 50, 60, 66.66, 75, 83.33, 90];
  const gridIn = GRID.filter((g) => g >= 6 && g <= 94);
  const mirrors: number[] = [];
  for (const c of centers) {
    const m = 100 - c;
    if (m >= 6 && m <= 94) mirrors.push(m);
  }
  const mids = pairMidpoints(centers);
  return uniqNearSorted([...centers, 50, ...gridIn, ...mirrors, ...mids], 0.1);
}

function snapAxisToNearest(
  raw: number,
  candidates: number[],
  threshold: number
): { value: number; guide: number | null } {
  let best: number | null = null;
  let bestD = threshold;
  for (const t of candidates) {
    const d = Math.abs(raw - t);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = t;
    }
  }
  if (best === null) return { value: clampFloorPct(raw), guide: null };
  const snapped = clampFloorPct(best);
  return { value: snapped, guide: snapped };
}

function parseApiErrorMessage(err: unknown): string {
  if (!(err instanceof Error) || !err.message) return "Une erreur est survenue.";
  try {
    const j = JSON.parse(err.message) as { message?: string };
    if (j?.message && typeof j.message === "string") return j.message;
  } catch {
    /* raw text */
  }
  return err.message;
}

type QrPdfEntry = { name: string; dataUrl: string };

type QrSheetItem = {
  tableId: string;
  name: string;
  previewUrl: string;
  dataUrl: string;
};

async function fetchQrBlob(tableId: string, token: string): Promise<Blob> {
  const response = await fetch(`${API_URL}/tables/${tableId}/qr`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error("Impossible de charger un QR code.");
  }
  return response.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("Lecture du fichier impossible."));
    fr.readAsDataURL(blob);
  });
}

function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildTablesQrPdf(items: QrPdfEntry[], restaurantName: string): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const titleY = 11;
  const yStart = 26;
  const cols = 2;
  const colGap = 10;
  const usableW = pageW - 2 * margin;
  const cellW = (usableW - colGap * (cols - 1)) / cols;
  const qrMm = Math.min(45, cellW - 1);
  const nameH = 5.5;
  const rowGap = 7;
  const rowH = qrMm + nameH + rowGap;
  const rowsPerPage = Math.max(1, Math.floor((pageH - yStart - margin) / rowH));
  const perPage = cols * rowsPerPage;
  const title = `QR codes — ${restaurantName.slice(0, 80)}`;

  for (let i = 0; i < items.length; i++) {
    if (i % perPage === 0) {
      if (i > 0) doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, titleY);
      doc.setFont("helvetica", "normal");
    }
    const slot = i % perPage;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const cellLeft = margin + col * (cellW + colGap);
    const imgX = cellLeft + (cellW - qrMm) / 2;
    const imgY = yStart + row * rowH;
    const it = items[i];
    try {
      doc.addImage(it.dataUrl, "PNG", imgX, imgY, qrMm, qrMm, undefined, "FAST");
    } catch {
      doc.setDrawColor(180);
      doc.rect(imgX, imgY, qrMm, qrMm);
    }
    doc.setFontSize(9);
    doc.text(it.name.slice(0, 36), cellLeft + cellW / 2, imgY + qrMm + 5.2, { align: "center" });
  }

  return doc.output("blob") as Blob;
}

export default function TablesPage() {
  return (
    <main className="container tables-pilot-page">
      <TokenGate>{(token) => <TablesPilot token={token} />}</TokenGate>
    </main>
  );
}

function TablesPilot({ token }: { token: string }) {
  const [name, setName] = useState("T1");
  const [tables, setTables] = useState<Table[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>([]);
  const [unpaidServedTableIds, setUnpaidServedTableIds] = useState<ReadonlySet<string>>(() => new Set());
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrSheetModalOpen, setQrSheetModalOpen] = useState(false);
  const [qrSheetLoading, setQrSheetLoading] = useState(false);
  const [qrSheetPdfBusy, setQrSheetPdfBusy] = useState(false);
  const [qrSheetError, setQrSheetError] = useState<string | null>(null);
  const [qrSheetItems, setQrSheetItems] = useState<QrSheetItem[]>([]);
  const [regenerateQrModalOpen, setRegenerateQrModalOpen] = useState(false);
  const [regenerateQrBusy, setRegenerateQrBusy] = useState(false);
  const [regenerateQrError, setRegenerateQrError] = useState<string | null>(null);
  const [modalTable, setModalTable] = useState<Table | null>(null);
  const [modalHistoryOrders, setModalHistoryOrders] = useState<KitchenOrder[]>([]);
  const [modalHistoryLoading, setModalHistoryLoading] = useState(false);
  const [tablesEditMode, setTablesEditMode] = useState(false);
  const [manageTable, setManageTable] = useState<Table | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageDeleting, setManageDeleting] = useState(false);
  const [createNameError, setCreateNameError] = useState<string | null>(null);
  const [addTableModalOpen, setAddTableModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [rooms, setRooms] = useState<FloorRoom[]>([]);
  const [floorRoomFilterId, setFloorRoomFilterId] = useState<string | null>(null);
  const [roomsManageModalOpen, setRoomsManageModalOpen] = useState(false);
  const [roomDraftNames, setRoomDraftNames] = useState<Record<string, string>>({});
  const [roomsManageError, setRoomsManageError] = useState<string | null>(null);
  const [roomActionBusyId, setRoomActionBusyId] = useState<string | null>(null);
  const [planZoomPct, setPlanZoomPct] = useState(PLAN_ZOOM_MAX_PCT);
  const [cardScalePct, setCardScalePct] = useState(80);
  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false);
  const [addRoomName, setAddRoomName] = useState("");
  const [addRoomError, setAddRoomError] = useState<string | null>(null);
  const [addRoomSaving, setAddRoomSaving] = useState(false);
  const [manageRoomId, setManageRoomId] = useState<string>("");
  const closeModalButtonRef = useRef<HTMLButtonElement>(null);
  const closeManageRef = useRef<HTMLButtonElement>(null);
  const closeAddTableRef = useRef<HTMLButtonElement>(null);
  const closeAddRoomRef = useRef<HTMLButtonElement>(null);
  const closeQrSheetRef = useRef<HTMLButtonElement>(null);
  const closeRegenerateQrRef = useRef<HTMLButtonElement>(null);
  const floorCanvasRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<{
    tableId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPct: { x: number; y: number };
    startTimeMs: number;
  } | null>(null);
  const dragLastPctRef = useRef<{ x: number; y: number } | null>(null);
  const [dragLivePct, setDragLivePct] = useState<{ tableId: string; x: number; y: number } | null>(null);
  const [floorSnapGuides, setFloorSnapGuides] = useState<{ vx: number | null; hy: number | null }>({
    vx: null,
    hy: null
  });

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" })),
    [tables]
  );

  const defaultRoomId = useMemo(
    () => rooms.find((r) => r.isDefault)?.id ?? rooms[0]?.id ?? null,
    [rooms]
  );

  const effectiveFloorRoomId = useMemo(
    () =>
      floorRoomFilterId && rooms.some((x) => x.id === floorRoomFilterId)
        ? floorRoomFilterId
        : (defaultRoomId ?? ""),
    [floorRoomFilterId, rooms, defaultRoomId]
  );

  const planTables = useMemo(() => {
    if (rooms.length === 0 || !floorRoomFilterId) return [];
    return sortedTables.filter((t) => t.roomId === floorRoomFilterId);
  }, [sortedTables, floorRoomFilterId, rooms.length]);

  useEffect(() => {
    if (!defaultRoomId) {
      setFloorRoomFilterId(null);
      return;
    }
    setFloorRoomFilterId((prev) => {
      if (prev && rooms.some((r) => r.id === prev)) return prev;
      return defaultRoomId;
    });
  }, [defaultRoomId, rooms]);

  const floorByTableId = useMemo(() => {
    const m = new Map<string, FloorKey>();
    for (const t of tables) {
      m.set(t.id, floorKeyForTable(t.id, kitchenOrders, unpaidServedTableIds));
    }
    return m;
  }, [tables, kitchenOrders, unpaidServedTableIds]);

  const activeTablesCount = useMemo(() => {
    let n = 0;
    for (const t of tables) {
      if (floorByTableId.get(t.id) !== "libre") n += 1;
    }
    return n;
  }, [tables, floorByTableId]);

  /** Même hauteur de zone pour toutes les salles : basée sur la salle principale (ex. Salle 1), pas sur la salle affichée. */
  const floorPlanLayoutTableCount = useMemo(() => {
    if (sortedTables.length === 0) return 0;
    if (!defaultRoomId) return sortedTables.length;
    const inDefault = sortedTables.filter((t) => t.roomId === defaultRoomId).length;
    if (inDefault > 0) return inDefault;
    if (rooms.length === 0) return sortedTables.length;
    return Math.max(
      1,
      rooms.reduce((mx, r) => Math.max(mx, sortedTables.filter((t) => t.roomId === r.id).length), 0)
    );
  }, [sortedTables, defaultRoomId, rooms]);

  const floorCanvasMinRem = useMemo(() => {
    const n = floorPlanLayoutTableCount;
    const zoom = planZoomPct / 100;
    if (n <= 0) return 14 * zoom;
    const cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const base = Math.max(15, 6 + rows * 5.85);
    return base * zoom;
  }, [floorPlanLayoutTableCount, planZoomPct]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const z2 = Number(localStorage.getItem(LS_TABLES_PLAN_ZOOM));
      if (!Number.isNaN(z2) && z2 > 0) {
        setPlanZoomPct(Math.min(PLAN_ZOOM_MAX_PCT, Math.max(PLAN_ZOOM_MIN_PCT, z2)));
      } else {
        const z1 = Number(localStorage.getItem(LS_TABLES_PLAN_ZOOM_LEGACY));
        if (!Number.isNaN(z1) && z1 >= 70 && z1 <= 140) {
          const migrated = Math.round(PLAN_ZOOM_MIN_PCT + ((z1 - 70) / 70) * (PLAN_ZOOM_MAX_PCT - PLAN_ZOOM_MIN_PCT));
          setPlanZoomPct(Math.min(PLAN_ZOOM_MAX_PCT, Math.max(PLAN_ZOOM_MIN_PCT, migrated)));
        }
      }
      const c = Number(localStorage.getItem(LS_TABLES_CARD_SCALE));
      if (!Number.isNaN(c) && c >= 80 && c <= 140) setCardScalePct(c);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TABLES_PLAN_ZOOM, String(planZoomPct));
    } catch {
      /* ignore */
    }
  }, [planZoomPct]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TABLES_CARD_SCALE, String(cardScalePct));
    } catch {
      /* ignore */
    }
  }, [cardScalePct]);

  const closeQrSheetModal = useCallback(() => {
    setQrSheetItems((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
    setQrSheetModalOpen(false);
    setQrSheetLoading(false);
    setQrSheetError(null);
    setQrSheetPdfBusy(false);
  }, []);

  const openQrSheetModal = useCallback(async () => {
    if (sortedTables.length === 0) return;
    setQrSheetModalOpen(true);
    setQrSheetLoading(true);
    setQrSheetError(null);
    setQrSheetItems((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
    try {
      const results: QrSheetItem[] = await Promise.all(
        sortedTables.map(async (t) => {
          const blob = await fetchQrBlob(t.id, token);
          const dataUrl = await blobToDataUrl(blob);
          const previewUrl = URL.createObjectURL(blob);
          return { tableId: t.id, name: t.name, previewUrl, dataUrl };
        })
      );
      setQrSheetItems(results);
    } catch (e) {
      setQrSheetError(parseApiErrorMessage(e));
    } finally {
      setQrSheetLoading(false);
    }
  }, [sortedTables, token]);

  const handleDownloadQrPdf = useCallback(() => {
    if (qrSheetItems.length === 0 || !me) return;
    setQrSheetPdfBusy(true);
    setQrSheetError(null);
    try {
      const blob = buildTablesQrPdf(
        qrSheetItems.map((i) => ({ name: i.name, dataUrl: i.dataUrl })),
        me.restaurant.name
      );
      const raw = me.restaurant.slug.replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
      downloadPdfBlob(blob, `qr-toutes-tables-${raw.length > 0 ? raw : "export"}.pdf`);
    } catch (e) {
      console.error(e);
      setQrSheetError("Impossible de générer le PDF.");
    } finally {
      setQrSheetPdfBusy(false);
    }
  }, [qrSheetItems, me]);

  const kitchenOrdersModalDigest = useMemo(() => {
    if (!modalTable) return "";
    return kitchenOrders
      .filter((o) => o.table.id === modalTable.id)
      .map((o) => `${o.id}:${o.status}`)
      .sort()
      .join("|");
  }, [kitchenOrders, modalTable]);

  useEffect(() => {
    if (!modalTable) {
      setModalHistoryOrders([]);
      setModalHistoryLoading(false);
      return;
    }
    let cancelled = false;
    setModalHistoryLoading(true);
    const now = new Date();
    const from = startOfLocalDay(now).toISOString();
    const to = now.toISOString();
    apiFetch<KitchenOrder[]>(
      `/orders/history?tableId=${encodeURIComponent(modalTable.id)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setModalHistoryOrders(
          list.map((o) => ({
            ...o,
            notes: o.notes ?? null,
            items: (o.items ?? []).map((it) => ({
              ...it,
              options: Array.isArray(it.options) ? it.options : []
            }))
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setModalHistoryOrders([]);
      })
      .finally(() => {
        if (!cancelled) setModalHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalTable, token, kitchenOrdersModalDigest]);

  const modalOrders = useMemo(() => {
    if (!modalTable) return [];
    const byId = new Map<string, KitchenOrder>();
    for (const o of modalHistoryOrders) {
      if (o.table.id !== modalTable.id) continue;
      byId.set(o.id, o);
    }
    for (const o of kitchenOrders) {
      if (o.table.id !== modalTable.id) continue;
      byId.set(o.id, {
        ...o,
        notes: o.notes ?? null,
        items: (o.items ?? []).map((it) => ({
          ...it,
          options: Array.isArray(it.options) ? it.options : []
        }))
      });
    }
    return [...byId.values()]
      .filter((o) => o.status !== "CANCELLED")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [modalTable, kitchenOrders, modalHistoryOrders]);

  const modalCanEncaisser = Boolean(modalTable && unpaidServedTableIds.has(modalTable.id));

  const load = useCallback(async () => {
    setBusy(true);
    const now = new Date();
    const from = startOfLocalDay(now);
    const qs = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}`;
    try {
      const [tableList, roomList, meRes, ko, a, overview] = await Promise.all([
        apiFetch<Table[]>("/tables", { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<FloorRoom[]>("/floor-rooms", { headers: { Authorization: `Bearer ${token}` } }).catch(
          () => [] as FloorRoom[]
        ),
        apiFetch<MeResponse>("/me", { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch<KitchenOrder[]>("/kitchen/orders?includeRecentServed=false", {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => [] as KitchenOrder[]),
        apiFetch<AnalyticsResponse>(`/dashboard/analytics${qs}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null),
        apiFetch<CaisseTableOverviewRow[]>("/caisse/tables-overview", {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => [] as CaisseTableOverviewRow[])
      ]);
      setTables(tableList);
      setRooms(
        Array.isArray(roomList) ? roomList.map((r) => ({ ...r, isDefault: Boolean(r.isDefault) })) : []
      );
      setMe(meRes);
      setKitchenOrders(
        (Array.isArray(ko) ? ko : []).map((o) => ({
          ...o,
          notes: o.notes ?? null,
          items: (o.items ?? []).map((it) => ({
            ...it,
            options: Array.isArray(it.options) ? it.options : []
          }))
        }))
      );
      setUnpaidServedTableIds(new Set((Array.isArray(overview) ? overview : []).map((r) => r.tableId)));
      setAnalytics(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [token]);

  const closeRegenerateQrModal = useCallback(() => {
    setRegenerateQrModalOpen(false);
    setRegenerateQrError(null);
    setRegenerateQrBusy(false);
  }, []);

  const confirmRegenerateAllQr = useCallback(async () => {
    if (sortedTables.length === 0) return;
    setRegenerateQrBusy(true);
    setRegenerateQrError(null);
    try {
      const list = await apiFetch<Table[]>("/tables/regenerate-qr-tokens", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (qrSheetModalOpen) closeQrSheetModal();
      setTables(Array.isArray(list) ? list : []);
      setRegenerateQrModalOpen(false);
      await load();
    } catch (e) {
      setRegenerateQrError(parseApiErrorMessage(e));
    } finally {
      setRegenerateQrBusy(false);
    }
  }, [sortedTables.length, token, load, qrSheetModalOpen, closeQrSheetModal]);

  const closeAddRoomModal = useCallback(() => {
    setAddRoomModalOpen(false);
    setAddRoomName("");
    setAddRoomError(null);
    setAddRoomSaving(false);
  }, []);

  const closeRoomsManageModal = useCallback(() => {
    setRoomsManageModalOpen(false);
    setRoomsManageError(null);
    setRoomActionBusyId(null);
    setRoomDraftNames({});
  }, []);

  function openRoomsManageModal() {
    if (!tablesEditMode) return;
    const m: Record<string, string> = {};
    for (const r of rooms) m[r.id] = r.name;
    setRoomDraftNames(m);
    setRoomsManageError(null);
    setRoomsManageModalOpen(true);
  }

  async function saveRoomDraft(roomId: string) {
    const name = (roomDraftNames[roomId] ?? "").trim();
    if (!name) {
      setRoomsManageError("Le nom de la salle ne peut pas être vide.");
      return;
    }
    setRoomsManageError(null);
    setRoomActionBusyId(roomId);
    try {
      const updated = await apiFetch<FloorRoom>(`/floor-rooms/${roomId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      setRooms((prev) =>
        prev
          .map((r) => (r.id === roomId ? { ...r, ...updated } : r))
          .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }))
      );
      setRoomDraftNames((prev) => ({ ...prev, [roomId]: updated.name }));
    } catch (e) {
      setRoomsManageError(parseApiErrorMessage(e));
    } finally {
      setRoomActionBusyId(null);
    }
  }

  async function deleteRoom(room: FloorRoom) {
    if (room.isDefault) return;
    const ok = window.confirm(
      `Supprimer la salle « ${room.name} » ? Les tables de cette salle seront déplacées vers la salle principale.`
    );
    if (!ok) return;
    setRoomsManageError(null);
    setRoomActionBusyId(room.id);
    try {
      await apiFetch(`/floor-rooms/${room.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      await load();
      closeRoomsManageModal();
    } catch (e) {
      setRoomsManageError(parseApiErrorMessage(e));
    } finally {
      setRoomActionBusyId(null);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    load().catch(console.error);
  }, [load]);

  useEffect(() => {
    const open =
      modalTable != null ||
      manageTable != null ||
      addTableModalOpen ||
      addRoomModalOpen ||
      roomsManageModalOpen ||
      qrSheetModalOpen ||
      regenerateQrModalOpen;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.requestAnimationFrame(() => {
      if (addTableModalOpen) {
        document.getElementById("tables-add-modal-name")?.focus();
      } else if (addRoomModalOpen) {
        closeAddRoomRef.current?.focus();
      } else if (qrSheetModalOpen) {
        closeQrSheetRef.current?.focus();
      } else if (regenerateQrModalOpen) {
        closeRegenerateQrRef.current?.focus();
      } else if (manageTable) {
        closeManageRef.current?.focus();
      } else {
        closeModalButtonRef.current?.focus();
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addTableModalOpen) setAddTableModalOpen(false);
      else if (addRoomModalOpen) closeAddRoomModal();
      else if (roomsManageModalOpen) closeRoomsManageModal();
      else if (qrSheetModalOpen) closeQrSheetModal();
      else if (regenerateQrModalOpen && !regenerateQrBusy) closeRegenerateQrModal();
      else if (manageTable) setManageTable(null);
      else setModalTable(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [
    modalTable,
    manageTable,
    addTableModalOpen,
    addRoomModalOpen,
    roomsManageModalOpen,
    qrSheetModalOpen,
    regenerateQrModalOpen,
    closeQrSheetModal,
    closeRegenerateQrModal,
    closeAddRoomModal,
    closeRoomsManageModal,
    regenerateQrBusy
  ]);

  useEffect(() => {
    if (!manageTable) {
      setManageName("");
      setManageRoomId("");
      setManageError(null);
      return;
    }
    const defId = rooms.find((r) => r.isDefault)?.id ?? rooms[0]?.id ?? "";
    setManageName(manageTable.name);
    setManageRoomId(manageTable.roomId ?? defId);
    setManageError(null);
  }, [manageTable, rooms]);

  useEffect(() => {
    if (!tablesEditMode) {
      dragSessionRef.current = null;
      dragLastPctRef.current = null;
      setDragLivePct(null);
      setFloorSnapGuides({ vx: null, hy: null });
    }
  }, [tablesEditMode]);

  async function persistTablePlan(tableId: string, x: number, y: number) {
    const cx = clampFloorPct(x);
    const cy = clampFloorPct(y);
    try {
      const updated = await apiFetch<Table>(`/tables/${tableId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planPosXPct: cx, planPosYPct: cy })
      });
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, ...updated } : t)));
    } catch (e) {
      console.error(e);
      await load();
    }
  }

  function handleFloorTablePointerDown(table: Table, index: number, e: React.PointerEvent) {
    if (!tablesEditMode) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    const canvas = floorCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;

    e.preventDefault();
    const total = planTables.length;
    const base = planPctForTable(table, index, total);
    const startPct =
      dragLivePct?.tableId === table.id ? { x: dragLivePct.x, y: dragLivePct.y } : base;

    dragSessionRef.current = {
      tableId: table.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPct,
      startTimeMs: typeof performance !== "undefined" ? performance.now() : Date.now()
    };
    dragLastPctRef.current = startPct;
    setFloorSnapGuides({ vx: null, hy: null });
    setDragLivePct({ tableId: table.id, x: startPct.x, y: startPct.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleFloorTablePointerMove(table: Table, e: React.PointerEvent) {
    const s = dragSessionRef.current;
    if (!s || s.tableId !== table.id || e.pointerId !== s.pointerId) return;
    const canvas = floorCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - s.startClientX) / rect.width) * 100;
    const dy = ((e.clientY - s.startClientY) / rect.height) * 100;
    const rawX = clampFloorPct(s.startPct.x + dx);
    const rawY = clampFloorPct(s.startPct.y + dy);
    const total = planTables.length;
    const candsX = buildFloorSnapCandidates("x", planTables, table.id, total);
    const candsY = buildFloorSnapCandidates("y", planTables, table.id, total);
    const thX = Math.min(5.2, Math.max(1.15, (14 / rect.width) * 100));
    const thY = Math.min(5.2, Math.max(1.15, (14 / rect.height) * 100));
    const sx = snapAxisToNearest(rawX, candsX, thX);
    const sy = snapAxisToNearest(rawY, candsY, thY);
    setFloorSnapGuides({ vx: sx.guide, hy: sy.guide });
    dragLastPctRef.current = { x: sx.value, y: sy.value };
    setDragLivePct({ tableId: table.id, x: sx.value, y: sy.value });
  }

  function handleFloorTablePointerUp(table: Table, e: React.PointerEvent) {
    const s = dragSessionRef.current;
    if (!s || s.tableId !== table.id || e.pointerId !== s.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const last = dragLastPctRef.current;
    const totalPx = Math.hypot(e.clientX - s.startClientX, e.clientY - s.startClientY);
    const smallMovePx = totalPx < FLOOR_TAP_MAX_PX;
    const posChanged =
      last != null &&
      (Math.abs(last.x - s.startPct.x) > FLOOR_DRAG_MIN_PCT ||
        Math.abs(last.y - s.startPct.y) > FLOOR_DRAG_MIN_PCT);
    const elapsedMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - s.startTimeMs;
    const isQuickClick = smallMovePx && !posChanged && elapsedMs <= FLOOR_CLICK_MAX_MS;

    dragSessionRef.current = null;
    dragLastPctRef.current = null;

    if (posChanged && last) {
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, planPosXPct: last.x, planPosYPct: last.y } : t))
      );
    }
    setDragLivePct(null);
    setFloorSnapGuides({ vx: null, hy: null });

    if (posChanged && last) {
      void persistTablePlan(table.id, last.x, last.y);
    } else if (isQuickClick) {
      setAddTableModalOpen(false);
      setManageTable(table);
    }
  }

  function handleFloorTablePointerCancel(table: Table, e: React.PointerEvent) {
    const s = dragSessionRef.current;
    if (!s || s.tableId !== table.id || e.pointerId !== s.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    dragSessionRef.current = null;
    dragLastPctRef.current = null;
    setDragLivePct(null);
    setFloorSnapGuides({ vx: null, hy: null });
  }

  function openAddTableModal() {
    setManageTable(null);
    setCreateNameError(null);
    setAddTableModalOpen(true);
  }

  function toggleTablesEditMode() {
    setTablesEditMode((v) => {
      const next = !v;
      if (next) {
        setModalTable(null);
      } else {
        setManageTable(null);
        setAddTableModalOpen(false);
        setAddRoomModalOpen(false);
        setAddRoomName("");
        setAddRoomError(null);
        setRoomsManageModalOpen(false);
        setRoomsManageError(null);
        setRoomDraftNames({});
      }
      return next;
    });
  }

  async function createFloorRoom() {
    const trimmed = addRoomName.trim();
    if (!trimmed) {
      setAddRoomError("Indique un nom de salle.");
      return;
    }
    if (rooms.some((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setAddRoomError("Une salle avec ce nom existe déjà.");
      return;
    }
    setAddRoomError(null);
    setAddRoomSaving(true);
    try {
      const created = await apiFetch<FloorRoom>("/floor-rooms", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed })
      });
      setRooms((prev) =>
        [...prev, { ...created, isDefault: Boolean(created.isDefault) }].sort(
          (a, b) =>
            Number(b.isDefault) - Number(a.isDefault) ||
            a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" })
        )
      );
      setAddRoomName("");
      setAddRoomModalOpen(false);
    } catch (e) {
      setAddRoomError(parseApiErrorMessage(e));
    } finally {
      setAddRoomSaving(false);
    }
  }

  async function createTable() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const targetRoomId = floorRoomFilterId ?? defaultRoomId;
    if (!targetRoomId) {
      setCreateNameError("Aucune salle disponible. Recharge la page ou contacte le support.");
      return;
    }
    if (tableNameTaken(tables, trimmed)) {
      setCreateNameError("Ce nom est déjà utilisé.");
      return;
    }
    setCreateNameError(null);
    setCreateSaving(true);
    try {
      await apiFetch("/tables", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed, roomId: targetRoomId })
      });
      setName("");
      setAddTableModalOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      setCreateNameError(parseApiErrorMessage(e));
    } finally {
      setCreateSaving(false);
    }
  }

  async function saveManageTable() {
    if (!manageTable) return;
    const trimmed = manageName.trim();
    if (!trimmed) {
      setManageError("Le nom ne peut pas être vide.");
      return;
    }
    if (tableNameTaken(tables, trimmed, manageTable.id)) {
      setManageError("Ce nom est déjà utilisé.");
      return;
    }
    setManageError(null);
    setManageSaving(true);
    try {
      const roomIdResolved = manageRoomId || defaultRoomId;
      if (!roomIdResolved) {
        setManageError("Aucune salle disponible.");
        return;
      }
      await apiFetch<Table>(`/tables/${manageTable.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: trimmed,
          roomId: roomIdResolved
        })
      });
      setManageTable(null);
      await load();
    } catch (e) {
      setManageError(parseApiErrorMessage(e));
    } finally {
      setManageSaving(false);
    }
  }

  async function deleteManageTable() {
    if (!manageTable) return;
    const ok = window.confirm(
      `Supprimer la table « ${manageTable.name} » ? Cette action est définitive. Les QR existants ne fonctionneront plus.`
    );
    if (!ok) return;
    setManageError(null);
    setManageDeleting(true);
    try {
      await apiFetch(`/tables/${manageTable.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setManageTable(null);
      await load();
    } catch (e) {
      setManageError(parseApiErrorMessage(e));
    } finally {
      setManageDeleting(false);
    }
  }

  const restaurantSlug = me?.restaurant.slug ?? "";
  const modalClientUrl =
    modalTable && restaurantSlug && origin
      ? `${origin}/r/${restaurantSlug}/t/${modalTable.qrToken}`
      : null;

  return (
    <div className="tables-pilot-stack">
      <header className="tables-pilot-header">
        <div className="tables-pilot-header-text">
          <h1 className="tables-pilot-greeting">
            {greetingWord()}, {me?.restaurant.name ?? "…"}.
          </h1>
          <p className="tables-pilot-lead muted">Plan de salle, QR codes et activité du jour.</p>
        </div>
        <div className="tables-pilot-header-actions">
          <button
            type="button"
            className="btn-secondary tables-pilot-qr-regen-btn"
            onClick={() => {
              setRegenerateQrError(null);
              setRegenerateQrModalOpen(true);
            }}
            disabled={tables.length === 0 || busy || regenerateQrBusy || qrSheetLoading}
            aria-haspopup="dialog"
            aria-expanded={regenerateQrModalOpen}
          >
            <RefreshCw size={17} strokeWidth={2} aria-hidden />
            <span>Régénérer les QR</span>
          </button>
          <button
            type="button"
            className="btn-primary-ios tables-pilot-print-qr"
            onClick={() => void openQrSheetModal()}
            disabled={tables.length === 0 || qrSheetLoading}
          >
            <QrCode size={18} strokeWidth={2} aria-hidden />
            Imprimer les QR
          </button>
        </div>
      </header>

      <section className="tables-pilot-kpi-row" aria-label="Indicateurs du jour">
        <article className="tables-pilot-kpi-card">
          <p className="tables-pilot-kpi-label">Chiffre d&apos;affaires</p>
          <p className="tables-pilot-kpi-value">{analytics ? formatEur(analytics.revenueCents) : "—"}</p>
          <p className="tables-pilot-kpi-hint muted">Aujourd&apos;hui</p>
        </article>
        <article className="tables-pilot-kpi-card">
          <p className="tables-pilot-kpi-label">Commandes du jour</p>
          <p className="tables-pilot-kpi-value">{analytics != null ? analytics.orderCount : "—"}</p>
          <p className="tables-pilot-kpi-hint muted">Sur la période en cours</p>
        </article>
        <article className="tables-pilot-kpi-card">
          <p className="tables-pilot-kpi-label">Tables actives</p>
          <p className="tables-pilot-kpi-value">
            {loading ? "—" : `${activeTablesCount}/${tables.length}`}
          </p>
          <p className="tables-pilot-kpi-hint muted">Avec commande en cours</p>
        </article>
        <article className="tables-pilot-kpi-card">
          <p className="tables-pilot-kpi-label">Panier moyen</p>
          <p className="tables-pilot-kpi-value">
            {analytics && analytics.orderCount > 0 ? formatEur(analytics.averageBasketCents) : "—"}
          </p>
          <p className="tables-pilot-kpi-hint muted">Sur commandes du jour</p>
        </article>
      </section>

      <div className="tables-pilot-body">
        <section className="panel tables-pilot-plan-card" aria-labelledby="tables-plan-title">
          <div className="tables-pilot-plan-head">
            <div className="tables-pilot-plan-head-main">
              <div className="tables-pilot-plan-title-block">
                <h2 id="tables-plan-title" className="tables-pilot-plan-title">
                  Plan de salle
                </h2>
                {rooms.length > 0 ? (
                  <div
                    className="tables-floor-room-tabs"
                    role="tablist"
                    aria-label="Salle affichée sur le plan"
                  >
                    {rooms.map((r) => {
                      const active = r.id === effectiveFloorRoomId;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          id={`tables-floor-room-tab-${r.id}`}
                          className={`tables-floor-room-tab${active ? " tables-floor-room-tab--active" : ""}`}
                          onClick={() => setFloorRoomFilterId(r.id)}
                        >
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <div className="tables-pilot-legend" aria-label="Légende des états">
                <span className="tables-pilot-legend-item">
                  <span className="tables-pilot-dot tables-pilot-dot--libre" aria-hidden />
                  Libre
                </span>
                <span className="tables-pilot-legend-item">
                  <span className="tables-pilot-dot tables-pilot-dot--salle" aria-hidden />
                  En salle (commandes en cours ou à encaisser)
                </span>
              </div>
              <button
                type="button"
                className={`btn-secondary tables-pilot-edit-link${tablesEditMode ? " tables-pilot-edit-link--active" : ""}`}
                onClick={toggleTablesEditMode}
                aria-pressed={tablesEditMode}
              >
                <Pencil size={16} strokeWidth={2} aria-hidden />
                {tablesEditMode ? "Terminer" : "Modifier"}
              </button>
            </div>
            {tablesEditMode && sortedTables.length > 0 ? (
              <div className="tables-pilot-plan-scale-tools" aria-label="Zoom du plan et taille des tables">
                <div className="tables-pilot-scale-field">
                  <label htmlFor="tables-plan-zoom">Zoom de la zone du plan</label>
                  <div className="tables-pilot-scale-row">
                    <input
                      id="tables-plan-zoom"
                      type="range"
                      className="tables-pilot-range"
                      min={PLAN_ZOOM_MIN_PCT}
                      max={PLAN_ZOOM_MAX_PCT}
                      step={5}
                      value={planZoomPct}
                      onChange={(e) => setPlanZoomPct(Number(e.target.value))}
                    />
                    <span className="tables-pilot-scale-value tabular-nums">{planZoomPct}%</span>
                  </div>
                </div>
                <div className="tables-pilot-scale-field">
                  <label htmlFor="tables-card-scale">Taille des tables</label>
                  <div className="tables-pilot-scale-row">
                    <input
                      id="tables-card-scale"
                      type="range"
                      className="tables-pilot-range"
                      min={80}
                      max={140}
                      step={5}
                      value={cardScalePct}
                      onChange={(e) => setCardScalePct(Number(e.target.value))}
                    />
                    <span className="tables-pilot-scale-value tabular-nums">{cardScalePct}%</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {tablesEditMode ? (
            <>
              <p className="tables-pilot-edit-banner" role="status">
                Mode édition : <strong>glisse</strong> une table — magnétisme sur les autres, le centre et la grille
                (guides en pointillés). <strong>Clic court</strong> sur une table (sans la déplacer) pour{" "}
                <strong>renommer</strong> / <strong>supprimer</strong>.{" "}
                <button type="button" className="link-inline tables-pilot-banner-link" onClick={openAddTableModal}>
                  Ajouter une table
                </button>
              </p>
              <div className="tables-pilot-room-bar tables-pilot-room-bar--edit-links" role="toolbar" aria-label="Salles">
                <button type="button" className="link-inline tables-pilot-banner-link" onClick={openRoomsManageModal}>
                  Gérer les salles
                </button>
                <button
                  type="button"
                  className="link-inline tables-pilot-banner-link tables-pilot-room-add-link"
                  onClick={() => {
                    setAddRoomError(null);
                    setAddRoomName("");
                    setAddRoomModalOpen(true);
                  }}
                >
                  + Ajouter une salle
                </button>
              </div>
            </>
          ) : null}

          {loading ? (
            <p className="muted tables-pilot-plan-empty">Chargement du plan…</p>
          ) : sortedTables.length === 0 ? (
            <p className="muted tables-pilot-plan-empty">
              Aucune table — clique sur <strong>Modifier</strong>, puis sur <strong>Ajouter une table</strong>.
            </p>
          ) : planTables.length === 0 ? (
            <p className="muted tables-pilot-plan-empty">
              Aucune table dans cette salle. Choisis une autre salle dans le menu, ou clique sur{" "}
              <strong>Modifier</strong> puis <strong>Ajouter une table</strong>.
            </p>
          ) : (
            <div className="tables-floor-zoom-host">
              <div
                ref={floorCanvasRef}
                className={`tables-floor-canvas${tablesEditMode ? " tables-floor-canvas--edit" : ""}`}
                style={{
                  minHeight: `${floorCanvasMinRem}rem`,
                  ["--tables-floor-card-scale" as string]: String(cardScalePct / 100)
                }}
              >
              {tablesEditMode && floorSnapGuides.vx != null ? (
                <div
                  className="tables-floor-snap-line tables-floor-snap-line--v"
                  style={{ left: `${floorSnapGuides.vx}%` }}
                  aria-hidden
                />
              ) : null}
              {tablesEditMode && floorSnapGuides.hy != null ? (
                <div
                  className="tables-floor-snap-line tables-floor-snap-line--h"
                  style={{ top: `${floorSnapGuides.hy}%` }}
                  aria-hidden
                />
              ) : null}
              {planTables.map((table, index) => {
                const fk = floorByTableId.get(table.id) ?? "libre";
                const total = planTables.length;
                const pos =
                  dragLivePct?.tableId === table.id
                    ? { x: dragLivePct.x, y: dragLivePct.y }
                    : planPctForTable(table, index, total);
                const isLifted = dragLivePct?.tableId === table.id;
                return (
                  <div
                    key={table.id}
                    role="button"
                    tabIndex={0}
                    className={`tables-floor-cell tables-floor-cell--${fk}${tablesEditMode ? " tables-floor-cell--edit-mode" : ""}${isLifted ? " tables-floor-cell--lifted" : ""}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={
                      tablesEditMode
                        ? undefined
                        : () => {
                            setModalTable(table);
                          }
                    }
                    onPointerDown={tablesEditMode ? (e) => handleFloorTablePointerDown(table, index, e) : undefined}
                    onPointerMove={tablesEditMode ? (e) => handleFloorTablePointerMove(table, e) : undefined}
                    onPointerUp={tablesEditMode ? (e) => handleFloorTablePointerUp(table, e) : undefined}
                    onPointerCancel={tablesEditMode ? (e) => handleFloorTablePointerCancel(table, e) : undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (tablesEditMode) {
                          setAddTableModalOpen(false);
                          setManageTable(table);
                        } else setModalTable(table);
                      }
                    }}
                    aria-label={
                      tablesEditMode
                        ? `Table ${table.name}, glisser pour déplacer ou clic court sans déplacer pour renommer ou supprimer`
                        : `Table ${table.name}, voir les commandes`
                    }
                  >
                    <div className="tables-floor-cell-main">
                      <span className="tables-floor-name">{table.name}</span>
                      <span className="tables-floor-state">{FLOOR_LABEL[fk]}</span>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
        </section>
      </div>

      {modalTable ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={() => setModalTable(null)}
          />
          <div
            className="tables-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head">
              <div>
                <h2 id="tables-modal-title" className="tables-modal-title">
                  Table {modalTable.name}
                </h2>
                <p className="tables-modal-sub muted">
                  {modalHistoryLoading && modalOrders.length === 0
                    ? "Chargement des commandes…"
                    : modalOrders.length === 0
                      ? "Aucune commande sur cette table aujourd’hui."
                      : `${modalOrders.length} commande${modalOrders.length > 1 ? "s" : ""} sur cette table`}
                </p>
                <div className="tables-modal-table-tools">
                  {modalClientUrl ? (
                    <button
                      type="button"
                      className="btn-secondary tables-modal-tool-btn"
                      onClick={() => window.open(modalClientUrl, "_blank", "noopener,noreferrer")}
                    >
                      Ouvrir l’interface client
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary tables-modal-tool-btn"
                    onClick={() => void downloadQr(modalTable.id, modalTable.name, token)}
                  >
                    Télécharger le QR
                  </button>
                  {modalCanEncaisser ? (
                    <Link
                      href={`/dashboard/caisse?table=${encodeURIComponent(modalTable.id)}`}
                      className="btn-secondary tables-modal-tool-btn"
                    >
                      Encaisser
                    </Link>
                  ) : null}
                </div>
              </div>
              <button
                ref={closeModalButtonRef}
                type="button"
                className="btn-secondary tables-modal-close"
                onClick={() => setModalTable(null)}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-modal-body">
              {modalHistoryLoading && modalOrders.length === 0 ? (
                <p className="muted tables-modal-empty">Chargement des commandes…</p>
              ) : modalOrders.length === 0 ? (
                <p className="muted tables-modal-empty">
                  Les commandes du jour (y compris servies) apparaissent ici. Rafraîchis la page si besoin.
                </p>
              ) : (
                <ul className="tables-modal-order-list">
                  {modalOrders.map((order) => (
                    <li key={order.id} className="tables-modal-order panel">
                      <div className="tables-modal-order-top">
                        <span className="tables-modal-order-num">#{order.orderNumber}</span>
                        <span className={`status kitchen-order-status ${statusClass(order.status)}`}>
                          {ORDER_STATUS_FR[order.status]}
                        </span>
                      </div>
                      <p className="tables-modal-order-time muted">
                        {new Date(order.createdAt).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short"
                        })}
                      </p>
                      {order.notes?.trim() ? (
                        <p className="tables-modal-notes">
                          <span className="muted">Note</span> {order.notes.trim()}
                        </p>
                      ) : null}
                      <ul className="tables-modal-lines">
                        {order.items.map((it) => (
                          <li key={it.id}>
                            <span className="tabular-nums">{it.quantity}×</span> {it.nameSnapshot}
                            {it.options.length > 0 ? (
                              <ul className="tables-modal-options muted">
                                {it.options.map((opt) => (
                                  <li key={opt.id}>+ {opt.nameSnapshot}</li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {manageTable ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={() => setManageTable(null)}
          />
          <div
            className="tables-modal-panel tables-modal-panel--manage"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-manage-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head tables-modal-head--manage">
              <div>
                <p className="tables-manage-eyebrow">Table {manageTable.name}</p>
                <h2 id="tables-manage-title" className="tables-modal-title">
                  Modifier
                </h2>
                <p className="tables-modal-sub muted">Ce nom apparaît sur le plan et sur les tickets.</p>
              </div>
              <button
                ref={closeManageRef}
                type="button"
                className="btn-secondary tables-modal-close"
                onClick={() => setManageTable(null)}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-modal-body tables-modal-body--manage">
              <div className="tables-manage-field">
                <label className="tables-manage-label" htmlFor="tables-manage-name">
                  Nom
                </label>
                <input
                  id="tables-manage-name"
                  className="tables-manage-input"
                  value={manageName}
                  onChange={(e) => {
                    setManageName(e.target.value);
                    setManageError(null);
                  }}
                  placeholder="Ex. T1, Terrasse 3"
                  autoComplete="off"
                />
              </div>
              <div className="tables-manage-field">
                <label className="tables-manage-label" htmlFor="tables-manage-room">
                  Salle
                </label>
                <select
                  id="tables-manage-room"
                  className="tables-manage-input tables-manage-select"
                  value={manageRoomId || (defaultRoomId ?? "")}
                  onChange={(e) => {
                    setManageRoomId(e.target.value);
                    setManageError(null);
                  }}
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isDefault ? " (principale)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {manageError ? (
                <p className="tables-manage-error" role="alert">
                  {manageError}
                </p>
              ) : null}
              <div className="tables-manage-footer">
                <div className="tables-manage-footer-row">
                  <button
                    type="button"
                    className="tables-manage-btn-cancel"
                    disabled={manageSaving || manageDeleting}
                    onClick={() => setManageTable(null)}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="tables-manage-btn-save"
                    disabled={manageSaving || manageDeleting}
                    onClick={() => void saveManageTable()}
                  >
                    {manageSaving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
                <button
                  type="button"
                  className="tables-manage-btn-delete"
                  disabled={manageSaving || manageDeleting}
                  onClick={() => void deleteManageTable()}
                >
                  {manageDeleting ? "Suppression…" : "Supprimer cette table"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addTableModalOpen ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={() => setAddTableModalOpen(false)}
          />
          <div
            className="tables-modal-panel tables-modal-panel--manage"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-add-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head tables-modal-head--manage">
              <div>
                <p className="tables-manage-eyebrow">Nouvelle table</p>
                <h2 id="tables-add-modal-title" className="tables-modal-title">
                  Ajouter une table
                </h2>
                <p className="tables-modal-sub muted">
                  Nom court (ex. T1, Terrasse 3). Un QR unique est généré automatiquement. Chaque nom doit être
                  unique (insensible à la casse). La table sera créée dans la salle{" "}
                  <strong>{rooms.find((r) => r.id === (floorRoomFilterId ?? defaultRoomId))?.name ?? "…"}</strong>.
                </p>
              </div>
              <button
                ref={closeAddTableRef}
                type="button"
                className="btn-secondary tables-modal-close"
                onClick={() => setAddTableModalOpen(false)}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-modal-body tables-modal-body--manage">
              <div className="tables-manage-field">
                <label className="tables-manage-label" htmlFor="tables-add-modal-name">
                  Nom
                </label>
                <input
                  id="tables-add-modal-name"
                  className="tables-manage-input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setCreateNameError(null);
                  }}
                  placeholder="Ex. T1, Terrasse 3"
                  autoComplete="off"
                  aria-invalid={createNameError ? true : undefined}
                />
              </div>
              {createNameError ? (
                <p className="tables-manage-error" role="alert">
                  {createNameError}
                </p>
              ) : null}
              <div className="tables-manage-footer">
                <div className="tables-manage-footer-row">
                  <button
                    type="button"
                    className="tables-manage-btn-cancel"
                    disabled={createSaving}
                    onClick={() => setAddTableModalOpen(false)}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="tables-manage-btn-save"
                    disabled={createSaving}
                    onClick={() => void createTable()}
                  >
                    {createSaving ? "Création…" : "Créer la table"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {addRoomModalOpen ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={closeAddRoomModal}
          />
          <div
            className="tables-modal-panel tables-modal-panel--manage"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-add-room-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head tables-modal-head--manage">
              <div>
                <p className="tables-manage-eyebrow">
                  <Building2 size={14} strokeWidth={2} className="tables-manage-eyebrow-icon" aria-hidden />
                  Plan de salle
                </p>
                <h2 id="tables-add-room-title" className="tables-modal-title">
                  Ajouter une salle
                </h2>
                <p className="tables-modal-sub muted">
                  Ex. Terrasse, Étage. Tu peux aussi déplacer une table vers une autre salle depuis{" "}
                  <strong>Modifier</strong> sur une table.
                </p>
              </div>
              <button
                ref={closeAddRoomRef}
                type="button"
                className="btn-secondary tables-modal-close"
                onClick={closeAddRoomModal}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-modal-body tables-modal-body--manage">
              <div className="tables-manage-field">
                <label className="tables-manage-label" htmlFor="tables-add-room-name">
                  Nom de la salle
                </label>
                <input
                  id="tables-add-room-name"
                  className="tables-manage-input"
                  value={addRoomName}
                  onChange={(e) => {
                    setAddRoomName(e.target.value);
                    setAddRoomError(null);
                  }}
                  placeholder="Ex. Terrasse, Étage"
                  autoComplete="off"
                  aria-invalid={addRoomError ? true : undefined}
                />
              </div>
              {addRoomError ? (
                <p className="tables-manage-error" role="alert">
                  {addRoomError}
                </p>
              ) : null}
              <div className="tables-manage-footer">
                <div className="tables-manage-footer-row">
                  <button
                    type="button"
                    className="tables-add-room-btn-cancel"
                    disabled={addRoomSaving}
                    onClick={closeAddRoomModal}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="tables-add-room-btn-save"
                    disabled={addRoomSaving}
                    onClick={() => void createFloorRoom()}
                  >
                    {addRoomSaving ? "Création…" : "Créer la salle"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {roomsManageModalOpen ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={closeRoomsManageModal}
          />
          <div
            className="tables-modal-panel tables-modal-panel--manage tables-modal-panel--rooms-manage"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-rooms-manage-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head tables-modal-head--manage tables-modal-head--rooms-manage">
              <div>
                <p className="tables-manage-eyebrow">
                  <Building2 size={14} strokeWidth={2} className="tables-manage-eyebrow-icon" aria-hidden />
                  Plan de salle
                </p>
                <h2 id="tables-rooms-manage-title" className="tables-modal-title">
                  Gérer les salles
                </h2>
              </div>
              <button
                type="button"
                className="btn-secondary tables-modal-close"
                onClick={closeRoomsManageModal}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-modal-body tables-modal-body--manage tables-modal-body--rooms-manage">
              <p className="tables-rooms-manage-intro muted">
                La salle principale ne peut pas être supprimée. Si tu supprimes une autre salle, ses tables sont
                déplacées vers la salle principale.
              </p>
              <ul className="tables-rooms-manage-list">
                {[...rooms]
                  .sort(
                    (a, b) =>
                      Number(b.isDefault) - Number(a.isDefault) ||
                      a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" })
                  )
                  .map((r) => {
                    const draft = roomDraftNames[r.id] ?? r.name;
                    const dirty = draft.trim() !== r.name;
                    return (
                      <li key={r.id} className="tables-rooms-manage-card">
                        <div className="tables-rooms-manage-card-top">
                          <div className="tables-rooms-manage-card-meta">
                            <span className="tables-rooms-manage-card-badge">
                              {r.isDefault ? "Salle principale" : "Salle"}
                            </span>
                            {r.isDefault ? (
                              <span className="tables-rooms-manage-card-note muted">Non supprimable</span>
                            ) : null}
                          </div>
                          <div className="tables-rooms-manage-card-actions">
                            <button
                              type="button"
                              className="tables-rooms-manage-btn-save"
                              disabled={!dirty || roomActionBusyId !== null}
                              onClick={() => void saveRoomDraft(r.id)}
                            >
                              {roomActionBusyId === r.id ? "Enregistrement…" : "Enregistrer"}
                            </button>
                            {!r.isDefault ? (
                              <button
                                type="button"
                                className="tables-rooms-manage-btn-delete"
                                disabled={roomActionBusyId !== null}
                                onClick={() => void deleteRoom(r)}
                              >
                                Supprimer
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <label className="tables-rooms-manage-field-label" htmlFor={`tables-room-name-${r.id}`}>
                          Nom affiché
                        </label>
                        <input
                          id={`tables-room-name-${r.id}`}
                          className="tables-manage-input tables-rooms-manage-input"
                          value={draft}
                          onChange={(e) => {
                            setRoomDraftNames((prev) => ({ ...prev, [r.id]: e.target.value }));
                            setRoomsManageError(null);
                          }}
                          disabled={roomActionBusyId !== null}
                          autoComplete="off"
                        />
                      </li>
                    );
                  })}
              </ul>
              {roomsManageError ? (
                <p className="tables-manage-error" role="alert">
                  {roomsManageError}
                </p>
              ) : null}
              <div className="tables-rooms-manage-footer">
                <button type="button" className="tables-manage-btn-cancel" onClick={closeRoomsManageModal}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {regenerateQrModalOpen ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={() => {
              if (!regenerateQrBusy) closeRegenerateQrModal();
            }}
          />
          <div
            className="tables-modal-panel tables-modal-panel--manage tables-modal-panel--regen-qr"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-regen-qr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head tables-modal-head--manage">
              <div>
                <p className="tables-manage-eyebrow">Action sensible</p>
                <h2 id="tables-regen-qr-title" className="tables-modal-title">
                  Régénérer tous les QR&nbsp;?
                </h2>
                <p className="tables-modal-sub muted">
                  Chaque table recevra un nouveau lien d&apos;accès au menu. Les commandes en cours restent liées aux
                  tables (pas aux QR).
                </p>
              </div>
              <button
                ref={closeRegenerateQrRef}
                type="button"
                className="btn-secondary tables-modal-close"
                disabled={regenerateQrBusy}
                onClick={closeRegenerateQrModal}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-regen-qr-body">
              <div className="tables-regen-qr-warn" role="status">
                <p className="tables-regen-qr-warn-title">
                  <AlertTriangle size={16} strokeWidth={2} className="tables-regen-qr-warn-icon" aria-hidden />
                  Pense aux supports sur les tables
                </p>
                <ul>
                  <li>
                    Les <strong>QR imprimés ou collés</strong> en salle ne fonctionneront plus : il faudra les{" "}
                    <strong>remplacer</strong> par de nouveaux codes (export PDF ou téléchargement par table).
                  </li>
                  <li>
                    Les clients qui ont encore l&apos;<strong>ancienne URL</strong> en favori ne pourront plus
                    commander depuis ce lien.
                  </li>
                </ul>
              </div>
              {regenerateQrError ? (
                <p className="tables-regen-qr-error" role="alert">
                  {regenerateQrError}
                </p>
              ) : null}
            </div>
            <footer className="tables-regen-qr-footer">
              <button
                type="button"
                className="tables-regen-qr-btn-cancel"
                disabled={regenerateQrBusy}
                onClick={() => {
                  if (!regenerateQrBusy) closeRegenerateQrModal();
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                className="tables-regen-qr-btn-confirm"
                disabled={regenerateQrBusy || sortedTables.length === 0}
                onClick={() => void confirmRegenerateAllQr()}
              >
                {regenerateQrBusy ? "Régénération…" : "Régénérer tous les QR"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {qrSheetModalOpen ? (
        <div className="tables-modal-root" role="presentation">
          <button
            type="button"
            className="tables-modal-backdrop"
            aria-label="Fermer la fenêtre"
            onClick={closeQrSheetModal}
          />
          <div
            className="tables-modal-panel tables-modal-panel--qr-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tables-qr-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="tables-modal-head">
              <div>
                <h2 id="tables-qr-sheet-title" className="tables-modal-title">
                  QR codes — toutes les tables
                </h2>
                <p className="tables-modal-sub muted">
                  Aperçu avant export. Le PDF reprend la même grille avec le nom sous chaque code.
                </p>
              </div>
              <button
                ref={closeQrSheetRef}
                type="button"
                className="btn-secondary tables-modal-close"
                onClick={closeQrSheetModal}
                aria-label="Fermer"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>
            <div className="tables-qr-sheet-body">
              {qrSheetLoading ? (
                <p className="muted tables-qr-sheet-hint">Chargement des QR…</p>
              ) : qrSheetError ? (
                <p className="tables-manage-error" role="alert">
                  {qrSheetError}
                </p>
              ) : (
                <>
                  <p className="muted tables-qr-sheet-hint">
                    {qrSheetItems.length} table{qrSheetItems.length > 1 ? "s" : ""} — même ordre que sur le plan
                    (tri par nom).
                  </p>
                  <div className="tables-qr-sheet-grid">
                    {qrSheetItems.map((item) => (
                      <div key={item.tableId} className="tables-qr-sheet-cell">
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="tables-qr-sheet-thumb"
                          width={160}
                          height={160}
                          decoding="async"
                        />
                        <p className="tables-qr-sheet-name">{item.name}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <footer className="tables-qr-sheet-footer">
              <button
                type="button"
                className="tables-qr-sheet-btn-cancel"
                disabled={qrSheetLoading}
                onClick={closeQrSheetModal}
              >
                Fermer
              </button>
              <button
                type="button"
                className="tables-qr-sheet-btn-download"
                disabled={qrSheetLoading || qrSheetPdfBusy || qrSheetItems.length === 0}
                onClick={handleDownloadQrPdf}
              >
                <Download size={17} strokeWidth={2} className="tables-qr-sheet-dl-icon" aria-hidden />
                {qrSheetPdfBusy ? "Génération…" : "Télécharger le PDF"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusClass(status: OrderStatus): string {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  if (status === "SERVED") return "status-served";
  return "status-cancelled";
}

async function downloadQr(tableId: string, tableName: string, token: string) {
  const response = await fetch(`${API_URL}/tables/${tableId}/qr`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error("Impossible de télécharger le QR.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `qr-${tableName}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
