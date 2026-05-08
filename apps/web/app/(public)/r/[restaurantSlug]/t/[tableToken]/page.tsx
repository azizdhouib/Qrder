"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { ChevronUp, Flame, Leaf, Minus, Plus, X } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";

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

function itemCartPreset(item: MenuData["categories"][0]["items"][0]) {
  const firstOption = item.options[0];
  const optionIds = firstOption ? [firstOption.id] : [];
  const optionNames = firstOption ? [firstOption.name] : [];
  const unit = item.priceCents + (firstOption?.priceDeltaCents ?? 0);
  return { optionIds, optionNames, unit };
}

export default function PublicMenuPage({
  params
}: {
  params: Promise<{ restaurantSlug: string; tableToken: string }>;
}) {
  const [resolved, setResolved] = useState<{ restaurantSlug: string; tableToken: string } | null>(null);
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderId, setOrderId] = useState<string>("");
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [placedItems, setPlacedItems] = useState<PlacedOrderLine[]>([]);
  const [placedTotal, setPlacedTotal] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"nav" | "cart">("nav");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    params.then(setResolved);
  }, [params]);

  useEffect(() => {
    if (!resolved) return;
    apiFetch<MenuData>(`/public/r/${resolved.restaurantSlug}/t/${resolved.tableToken}/menu`)
      .then(setMenu)
      .catch(console.error);
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
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const total = useMemo(
    () => cart.reduce((acc, line) => acc + line.unitPriceCents * line.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(() => cart.reduce((acc, l) => acc + l.quantity, 0), [cart]);

  if (!menu || !resolved) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <p className="text-[15px] text-muted-foreground">Chargement du menu...</p>
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
    const payload = {
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

  function addToCart(item: MenuData["categories"][0]["items"][0]) {
    const { optionIds, optionNames, unit } = itemCartPreset(item);
    setCart((prev) => {
      const idx = prev.findIndex((l) => sameCartConfig(item.id, optionIds, l));
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          quantity: 1,
          optionIds,
          optionNames,
          unitPriceCents: unit
        }
      ];
    });
  }

  function subtractFromCart(item: MenuData["categories"][0]["items"][0]) {
    const { optionIds } = itemCartPreset(item);
    setCart((prev) => {
      const idx = prev.findIndex((l) => sameCartConfig(item.id, optionIds, l));
      if (idx < 0) return prev;
      return prev
        .map((c, i) => (i === idx ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0);
    });
  }

  function qtyForItem(item: MenuData["categories"][0]["items"][0]) {
    const { optionIds } = itemCartPreset(item);
    const line = cart.find((l) => sameCartConfig(item.id, optionIds, l));
    return line?.quantity ?? 0;
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
                const qty = qtyForItem(item);
                return (
                  <li key={item.id} className="py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-display text-[18px] font-semibold tracking-tight text-foreground">
                            {item.name}
                          </p>
                          <p className="shrink-0 tabular-nums text-[15px] text-muted-foreground">
                            {(item.priceCents / 100).toFixed(2)} €
                          </p>
                        </div>
                        <p className="mt-1 text-[14px] text-muted-foreground">
                          {item.description ?? "Plat maison"}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {item.options.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Flame className="h-3 w-3 text-primary" aria-hidden />
                              Option
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Leaf className="h-3 w-3 text-primary" aria-hidden />
                              Maison
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        {qty === 0 ? (
                          <button
                            type="button"
                            aria-label="Ajouter"
                            onClick={() => addToCart(item)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_8px_-1px_oklch(0.55_0.16_255_/_0.35)] ring-2 ring-primary/20 ring-offset-2 ring-offset-background transition-[transform,box-shadow] hover:scale-105 hover:shadow-[0_4px_14px_-2px_oklch(0.5_0.17_255_/_0.4)] active:scale-95"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1 rounded-full bg-primary/[0.13] px-0.5 py-0.5 text-foreground shadow-sm ring-1 ring-primary/20 backdrop-blur-sm">
                            <button
                              type="button"
                              aria-label="Diminuer"
                              onClick={() => subtractFromCart(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/15 active:scale-95"
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            </button>
                            <span className="min-w-[1.25rem] px-0.5 text-center text-[13px] font-semibold tabular-nums text-foreground">
                              {qty}
                            </span>
                            <button
                              type="button"
                              aria-label="Augmenter"
                              onClick={() => addToCart(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/15 active:scale-95"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {cartCount > 0 && !sheetOpen && (
        <button
          type="button"
          onClick={() => {
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
                          <p className="text-foreground">
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
                  <span className="text-foreground">
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
