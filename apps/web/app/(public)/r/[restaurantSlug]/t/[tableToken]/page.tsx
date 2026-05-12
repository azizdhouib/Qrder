"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { ChevronUp, Flame, Minus, Plus, X } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";
import { snapshotGet, snapshotPut } from "@/lib/offline/db";
import { publicMenuSnapshotKey } from "@/lib/offline/snapshotKeys";

type MenuData = {
  restaurant: { name: string; slug: string };
  table: { token: string; name: string };
  categories: {
    id: string;
    name: string;
    items: {
      id: string;
      name: string;
      description?: string;
      imageUrl?: string | null;
      tags?: string[];
      priceCents: number;
      options: { id: string; name: string; priceDeltaCents: number }[];
    }[];
  }[];
};

type CartLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
  unitPriceCents: number;
};

type PlacedOrderLine = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  lineTotalCents: number;
  options: { id: string; nameSnapshot: string; priceDeltaCents: number }[];
};

function optionSetKey(optionIds: string[]): string {
  if (optionIds.length === 0) return "";
  return [...optionIds].sort().join("|");
}

function sameCartConfig(menuItemId: string, optionIds: string[], line: CartLine): boolean {
  return line.menuItemId === menuItemId && optionSetKey(line.optionIds) === optionSetKey(optionIds);
}

type MenuItemRow = MenuData["categories"][0]["items"][0];

function formatOptionDelta(cents: number): string {
  const e = cents / 100;
  if (e === 0) return "";
  const sign = e > 0 ? "+" : "−";
  return ` ${sign}${Math.abs(e).toFixed(2)} €`;
}

export default function PublicMenuPage({
  params
}: {
  params: Promise<{ restaurantSlug: string; tableToken: string }>;
}) {
  const [resolved, setResolved] = useState<{ restaurantSlug: string; tableToken: string } | null>(null);
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [menuFetchDone, setMenuFetchDone] = useState(false);
  const [orderHint, setOrderHint] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderId, setOrderId] = useState<string>("");
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [placedItems, setPlacedItems] = useState<PlacedOrderLine[]>([]);
  const [placedTotal, setPlacedTotal] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"nav" | "cart">("nav");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [optionPickerItem, setOptionPickerItem] = useState<MenuItemRow | null>(null);
  const [optionPickerSelectedIds, setOptionPickerSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    params.then(setResolved);
  }, [params]);

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    setMenuFetchDone(false);
    (async () => {
      try {
        const m = await apiFetch<MenuData>(`/public/r/${resolved.restaurantSlug}/t/${resolved.tableToken}/menu`);
        if (cancelled) return;
        setMenu(m);
        await snapshotPut(publicMenuSnapshotKey(resolved.restaurantSlug, resolved.tableToken), m).catch(() => {});
      } catch (e) {
        console.error(e);
        const cached = await snapshotGet<MenuData>(
          publicMenuSnapshotKey(resolved.restaurantSlug, resolved.tableToken)
        ).catch(() => null);
        if (!cancelled && cached) setMenu(cached);
      } finally {
        if (!cancelled) setMenuFetchDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  useEffect(() => {
    if (!orderId) return;
    const socket = io(API_URL);
    socket.emit("joinOrder", orderId);
    socket.on("order.updated", (data: { id: string; status: string }) => {
      if (data.id === orderId) setOrderStatus(data.status);
    });
    return () => {
      socket.disconnect();
    };
  }, [orderId]);

  useEffect(() => {
    const locked = sheetOpen || optionPickerItem != null;
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen, optionPickerItem]);

  useEffect(() => {
    if (!optionPickerItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOptionPickerItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [optionPickerItem]);

  const total = useMemo(
    () => cart.reduce((acc, line) => acc + line.unitPriceCents * line.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(() => cart.reduce((acc, l) => acc + l.quantity, 0), [cart]);

  const pickerUnitCents = useMemo(() => {
    if (!optionPickerItem) return 0;
    const chosen = optionPickerItem.options.filter((o) => optionPickerSelectedIds.includes(o.id));
    return optionPickerItem.priceCents + chosen.reduce((s, o) => s + o.priceDeltaCents, 0);
  }, [optionPickerItem, optionPickerSelectedIds]);

  if (!resolved) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <p className="text-[15px] text-muted-foreground">Chargement du menu...</p>
      </main>
    );
  }
  if (!menuFetchDone) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <p className="text-[15px] text-muted-foreground">Chargement du menu...</p>
      </main>
    );
  }
  if (!menu) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <p className="text-[15px] text-muted-foreground">Menu indisponible sans connexion.</p>
      </main>
    );
  }

  function scrollToCategory(catId: string) {
    setActiveCategoryId(catId);
    document.getElementById(`menu-cat-${catId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSheetOpen(false);
  }

  async function submitOrder() {
    if (!resolved) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOrderHint("Connexion requise pour envoyer la commande à la cuisine.");
      return;
    }
    setOrderHint(null);
    const payload: Record<string, unknown> = {
      restaurantSlug: resolved.restaurantSlug,
      tableToken: resolved.tableToken,
      items: cart.map((c) => ({
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        optionIds: c.optionIds
      }))
    };
    const order = await apiFetch<{
      id: string;
      status: string;
      orderNumber: number;
      totalCents: number;
      items: PlacedOrderLine[];
    }>("/public/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setOrderId(order.id);
    setOrderStatus(order.status);
    setOrderNumber(order.orderNumber);
    setPlacedItems(order.items);
    setPlacedTotal(order.totalCents);
    setCart([]);
    setSheetOpen(false);
  }

  function lastLineOptionIdsForItem(itemId: string): string[] | null {
    for (let i = cart.length - 1; i >= 0; i--) {
      if (cart[i].menuItemId === itemId) return [...cart[i].optionIds];
    }
    return null;
  }

  function addCartLineWithOptions(item: MenuItemRow, selectedOptionIds: string[]) {
    const sorted = [...selectedOptionIds].sort();
    const chosen = item.options.filter((o) => sorted.includes(o.id));
    const unit = item.priceCents + chosen.reduce((s, o) => s + o.priceDeltaCents, 0);
    const optionNames = chosen.map((o) => o.name);
    setCart((prev) => {
      const idx = prev.findIndex((l) => sameCartConfig(item.id, sorted, l));
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          quantity: 1,
          optionIds: sorted,
          optionNames,
          unitPriceCents: unit
        }
      ];
    });
  }

  function openOptionPicker(item: MenuItemRow) {
    setOptionPickerItem(item);
    setOptionPickerSelectedIds(lastLineOptionIdsForItem(item.id) ?? []);
  }

  function confirmOptionPicker() {
    if (!optionPickerItem) return;
    addCartLineWithOptions(optionPickerItem, optionPickerSelectedIds);
    setOptionPickerItem(null);
  }

  function handleAddPress(item: MenuItemRow) {
    if (item.options.length > 0) {
      openOptionPicker(item);
      return;
    }
    addCartLineWithOptions(item, []);
  }

  function subtractFromCartItem(item: MenuItemRow) {
    setCart((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].menuItemId === item.id) {
          const line = prev[i];
          if (line.quantity <= 1) return prev.filter((_, j) => j !== i);
          return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity - 1 } : l));
        }
      }
      return prev;
    });
  }

  function qtySumForItem(itemId: string) {
    return cart.reduce((acc, l) => acc + (l.menuItemId === itemId ? l.quantity : 0), 0);
  }

  function adjustLineQuantity(lineIndex: number, delta: number) {
    setCart((prev) => {
      const next = prev
        .map((c, i) => (i === lineIndex ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0);
      return next;
    });
  }

  return (
    <main className="client-public-menu min-h-screen bg-background pb-32 text-foreground antialiased [font-feature-settings:'ss01','cv11']">
      <header className="mx-auto max-w-2xl px-5 pb-6 pt-10">
        <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-primary">
          Table {menu.table.name}
        </p>
        <h1 className="font-display text-5xl font-semibold tracking-tight text-foreground">
          {menu.restaurant.name}
        </h1>
        <p className="text-[15px] text-muted-foreground">Commandez depuis la table, en quelques gestes.</p>
      </header>

      {orderHint ? (
        <div className="mx-auto max-w-2xl px-5 pb-2" role="status">
          <p className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-[14px] leading-snug text-muted-foreground backdrop-blur-sm">
            {orderHint}
          </p>
        </div>
      ) : null}

      <div className="sticky top-0 z-30 border-b border-border glass">
        <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {menu.categories.map((cat) => {
            const isActive = activeCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                className={
                  isActive
                    ? "shrink-0 rounded-full bg-foreground px-4 py-1.5 text-[13px] font-medium text-background"
                    : "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-secondary"
                }
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-5">
        {menu.categories.map((cat) => (
          <section key={cat.id} id={`menu-cat-${cat.id}`} className="scroll-mt-28 pt-2">
            <h2 className="font-display pb-3 pt-8 text-xl font-semibold tracking-tight text-foreground">
              {cat.name}
            </h2>
            <ul className="divide-y divide-border">
              {cat.items.map((item) => {
                const qty = qtySumForItem(item.id);
                return (
                  <li key={item.id} className="py-5">
                    <div className="flex items-start gap-4">
                      {item.imageUrl ? (
                        <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[14px] bg-secondary ring-1 ring-border/60">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 flex-1 break-words font-display text-[18px] font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]">
                              {item.name}
                            </p>
                            <p className="shrink-0 tabular-nums text-[15px] text-muted-foreground">
                              {(item.priceCents / 100).toFixed(2)} €
                            </p>
                          </div>
                          {item.description ? (
                            <p className="mt-1 max-w-full break-words text-[14px] text-muted-foreground [overflow-wrap:anywhere]">
                              {item.description}
                            </p>
                          ) : null}
                          {(item.tags?.length ?? 0) > 0 || item.options.length > 0 ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {(item.tags ?? []).map((tag) => (
                                <span
                                  key={`${item.id}-${tag}`}
                                  className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                >
                                  {tag}
                                </span>
                              ))}
                              {item.options.length > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  <Flame className="h-3 w-3 text-primary" aria-hidden />
                                  Options
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {qty === 0 ? (
                            <button
                              type="button"
                              aria-label={item.options.length > 0 ? "Choisir les options" : "Ajouter"}
                              onClick={() => handleAddPress(item)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_8px_-1px_oklch(0.55_0.16_255_/_0.35)] ring-2 ring-primary/20 ring-offset-2 ring-offset-background transition-[transform,box-shadow] hover:scale-105 hover:shadow-[0_4px_14px_-2px_oklch(0.5_0.17_255_/_0.4)] active:scale-95"
                            >
                              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1 rounded-full bg-primary/[0.13] px-0.5 py-0.5 text-foreground shadow-sm ring-1 ring-primary/20 backdrop-blur-sm">
                              <button
                                type="button"
                                aria-label="Diminuer"
                                onClick={() => subtractFromCartItem(item)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/15 active:scale-95"
                              >
                                <Minus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                              </button>
                              <span className="min-w-[1.25rem] px-0.5 text-center text-[13px] font-semibold tabular-nums text-foreground">
                                {qty}
                              </span>
                              <button
                                type="button"
                                aria-label={item.options.length > 0 ? "Ajouter avec options" : "Augmenter"}
                                onClick={() => handleAddPress(item)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/15 active:scale-95"
                              >
                                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {optionPickerItem && (
        <div
          className="fixed inset-0 z-[56] flex flex-col justify-end sm:justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="option-picker-title"
        >
          <button
            type="button"
            className="absolute inset-0 border-0 bg-foreground/40 backdrop-blur-md"
            aria-label="Fermer"
            onClick={() => setOptionPickerItem(null)}
          />
          <div
            className="relative mx-auto max-h-[min(88vh,560px)] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-border bg-card shadow-pop sm:rounded-[1.75rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="option-picker-title"
                    className="font-display text-xl font-semibold tracking-tight text-foreground"
                  >
                    {optionPickerItem.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Coche les options souhaitées (plusieurs possibles).
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setOptionPickerItem(null)}
                  className="shrink-0 rounded-full p-2 text-foreground hover:bg-secondary"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <ul className="flex flex-col gap-2">
                {optionPickerItem.options.map((opt) => {
                  const on = optionPickerSelectedIds.includes(opt.id);
                  const deltaLabel = formatOptionDelta(opt.priceDeltaCents);
                  return (
                    <li key={opt.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setOptionPickerSelectedIds((prev) =>
                            prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                          )
                        }
                        className={
                          on
                            ? "flex w-full items-center justify-between gap-3 rounded-2xl border border-primary bg-primary/[0.12] px-4 py-3.5 text-left transition-colors ring-1 ring-primary/25"
                            : "flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3.5 text-left transition-colors hover:bg-secondary/70"
                        }
                      >
                        <span className="text-[15px] font-medium text-foreground">{opt.name}</span>
                        {deltaLabel ? (
                          <span className="shrink-0 text-[14px] tabular-nums text-muted-foreground">
                            {deltaLabel.trim()}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[12px] text-muted-foreground">Inclus</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-border pt-4">
                <span className="text-[13px] text-muted-foreground">Total pour 1 portion</span>
                <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {(pickerUnitCents / 100).toFixed(2)} €
                </span>
              </div>

              <button
                type="button"
                onClick={confirmOptionPicker}
                className="mt-4 w-full rounded-2xl bg-primary py-3.5 text-[15px] font-medium text-primary-foreground shadow-[0_2px_12px_-2px_oklch(0.55_0.17_255_/_0.35)] ring-1 ring-primary/20 transition-[transform,box-shadow] active:scale-[0.99]"
              >
                Ajouter au panier
              </button>
            </div>
          </div>
        </div>
      )}

      {cartCount > 0 && !sheetOpen && (
        <button
          type="button"
          onClick={() => {
            setOptionPickerItem(null);
            setSheetTab("cart");
            setSheetOpen(true);
          }}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-pop ring-1 ring-primary/25 transition-[transform,box-shadow] active:scale-[0.99]"
        >
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground/18 text-[11px] font-semibold tabular-nums">
              {cartCount}
            </span>
            Voir le panier
          </span>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold tabular-nums">
            {(total / 100).toFixed(2)} € <ChevronUp className="h-4 w-4" aria-hidden />
          </span>
        </button>
      )}

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Panier"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="animate-client-menu-sheet fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 rounded-t-[2rem] bg-card p-6 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />

            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">Panier</h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setSheetOpen(false)}
                className="rounded-full p-1.5 text-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {cart.length === 0 && (
              <p className="text-[14px] text-muted-foreground">Ton panier est vide.</p>
            )}

            {cart.length > 0 && (
              <>
                <ul className="divide-y divide-border">
                  {cart.map((line, idx) => (
                    <li key={`${line.menuItemId}-${optionSetKey(line.optionIds)}`} className="py-3 text-[14px]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-foreground [overflow-wrap:anywhere]">
                            <span className="font-medium tabular-nums">{line.quantity}</span>
                            <span className="text-muted-foreground">× </span>
                            {line.name}
                            {line.optionNames.length > 0 ? (
                              <span className="text-muted-foreground"> · {line.optionNames.join(", ")}</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="inline-flex items-center gap-1 rounded-full bg-primary/[0.13] px-0.5 py-0.5 text-foreground ring-1 ring-primary/20 shadow-sm">
                            <button
                              type="button"
                              aria-label="Diminuer"
                              onClick={() => adjustLineQuantity(idx, -1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/15 active:scale-95"
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            </button>
                            <span className="min-w-[1.25rem] px-0.5 text-center text-[13px] font-semibold tabular-nums text-foreground">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Augmenter"
                              onClick={() => adjustLineQuantity(idx, 1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/15 active:scale-95"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            </button>
                          </div>
                          <p className="tabular-nums text-[14px] font-medium text-foreground">
                            {((line.unitPriceCents * line.quantity) / 100).toFixed(2)} €
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 border-t border-border pt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-muted-foreground">Total</span>
                    <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                      {(total / 100).toFixed(2)} €
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await submitOrder();
                    } catch (e) {
                      console.error(e);
                      window.alert("Impossible d'envoyer la commande. Réessaie.");
                    }
                  }}
                  className="mt-5 w-full rounded-2xl bg-primary py-4 text-[15px] font-medium text-primary-foreground shadow-[0_2px_12px_-2px_oklch(0.55_0.17_255_/_0.35)] ring-1 ring-primary/20 transition-[transform,box-shadow] hover:shadow-[0_4px_20px_-4px_oklch(0.5_0.18_255_/_0.42)] active:scale-[0.99]"
                >
                  Envoyer en cuisine
                </button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Ta commande part directement en cuisine. Vérifie les quantités avant d&apos;envoyer.
                </p>

                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="mt-3 w-full rounded-2xl py-2 text-[13px] font-medium text-muted-foreground hover:bg-secondary"
                >
                  Vider le panier
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {orderId && (
        <section className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-card px-5 py-6 shadow-pop">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">Commande envoyée</h3>
            <span className={`status ${statusClass(orderStatus)}`}>{statusLabelFr(orderStatus)}</span>
          </div>
          {orderNumber != null ? (
            <p className="mt-2 text-[14px] text-muted-foreground">Commande #{orderNumber}</p>
          ) : null}
          <p className="text-[14px] text-muted-foreground">Table : {menu.table.name}</p>
          <p className="text-[14px] text-muted-foreground">
            Total : {(placedTotal / 100).toFixed(2)} €
          </p>
          <ul className="mt-4 divide-y divide-border">
            {placedItems.map((line) => (
              <li key={line.id} className="py-3 text-[14px]">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 flex-1 break-words text-foreground [overflow-wrap:anywhere]">
                    <span className="tabular-nums font-medium">{line.quantity}</span>× {line.nameSnapshot}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {(line.lineTotalCents / 100).toFixed(2)} €
                  </span>
                </div>
                {line.options.length > 0 ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {line.options
                      .map((o) => `${o.nameSnapshot} (+${(o.priceDeltaCents / 100).toFixed(2)} €)`)
                      .join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function statusLabelFr(status: string): string {
  if (status === "PLACED") return "En attente";
  if (status === "PREPARING") return "En préparation";
  if (status === "READY") return "Prêt";
  if (status === "SERVED") return "Servi";
  if (status === "CANCELLED") return "Annulé";
  return status || "—";
}

function statusClass(status: string) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  return "status-served";
}
