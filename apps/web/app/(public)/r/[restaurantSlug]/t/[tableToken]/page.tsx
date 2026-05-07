"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
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
      <main className="container">
        <section className="hero">
          <span className="badge">Menu client</span>
          <h1 className="hero-title">Chargement du menu...</h1>
        </section>
      </main>
    );
  }

  function scrollToCategory(catId: string) {
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

  return (
    <main className="client-menu-page container stack">
      <div className="client-menu-top-bar" role="toolbar" aria-label="Navigation et panier">
        <button
          type="button"
          className="client-menu-bar-btn client-menu-bar-primary"
          onClick={() => {
            setSheetTab("nav");
            setSheetOpen(true);
          }}
        >
          <span className="client-menu-burger-icon" aria-hidden="true">
            ☰
          </span>
          <span>Menu</span>
        </button>
        <button
          type="button"
          className={`client-menu-bar-btn client-menu-bar-cart ${cartCount > 0 ? "client-menu-bar-cart-active" : ""}`}
          onClick={() => {
            setSheetTab("cart");
            setSheetOpen(true);
          }}
        >
          <span className="client-menu-cart-label">Panier</span>
          {cartCount > 0 ? (
            <>
              <span className="client-menu-cart-badge">{cartCount}</span>
              <span className="client-menu-cart-total">{(total / 100).toFixed(2)} €</span>
            </>
          ) : (
            <span className="client-menu-cart-empty">Vide</span>
          )}
        </button>
      </div>

      <section className="hero client-menu-hero">
        <span className="badge">Commande mobile</span>
        <h1 className="hero-title">{menu.restaurant.name}</h1>
        <p className="hero-subtitle">Table {menu.table.name}</p>
      </section>

      {menu.categories.map((cat) => (
        <section key={cat.id} id={`menu-cat-${cat.id}`} className="panel client-menu-category">
          <div className="row-between">
            <h3 className="panel-title client-menu-cat-title">{cat.name}</h3>
            <span className="pill">{cat.items.length}</span>
          </div>
          <div className="menu-grid client-menu-grid">
            {cat.items.map((item) => (
              <article key={item.id} className="menu-card">
                <div className="menu-card-media">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="menu-thumb client-menu-thumb" />
                  ) : (
                    <div className="menu-thumb menu-thumb-placeholder client-menu-thumb">Photo à venir</div>
                  )}
                </div>
                <div className="menu-card-body">
                  <div className="row-between">
                    <strong>{item.name}</strong>
                    <strong>{(item.priceCents / 100).toFixed(2)} EUR</strong>
                  </div>
                  <p className="muted client-menu-desc">{item.description ?? "Plat maison"}</p>
                </div>
                <div className="menu-card-footer">
                  <button
                    onClick={() => {
                      const firstOption = item.options[0];
                      const optionIds = firstOption ? [firstOption.id] : [];
                      const optionNames = firstOption ? [firstOption.name] : [];
                      const unit = item.priceCents + (firstOption?.priceDeltaCents ?? 0);
                      setCart((prev) => {
                        const idx = prev.findIndex((l) => sameCartConfig(item.id, optionIds, l));
                        if (idx >= 0) {
                          return prev.map((l, i) =>
                            i === idx ? { ...l, quantity: l.quantity + 1 } : l
                          );
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
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {sheetOpen && (
        <div className="client-menu-sheet-root" role="dialog" aria-modal="true" aria-label="Menu et panier">
          <button type="button" className="client-menu-sheet-backdrop" aria-label="Fermer" onClick={() => setSheetOpen(false)} />
          <div className="client-menu-sheet">
            <div className="client-menu-sheet-header">
              <div className="client-menu-sheet-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={sheetTab === "nav"}
                  className={sheetTab === "nav" ? "active" : ""}
                  onClick={() => setSheetTab("nav")}
                >
                  Catégories
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sheetTab === "cart"}
                  className={sheetTab === "cart" ? "active" : ""}
                  onClick={() => setSheetTab("cart")}
                >
                  Panier {cartCount > 0 ? `(${cartCount})` : ""}
                </button>
              </div>
              <button type="button" className="client-menu-sheet-close btn-secondary" onClick={() => setSheetOpen(false)}>
                Fermer
              </button>
            </div>

            {sheetTab === "nav" && (
              <div className="client-menu-sheet-body client-menu-sheet-nav">
                <p className="muted" style={{ margin: "0 0 0.75rem" }}>
                  Touche une catégorie pour y aller.
                </p>
                <ul className="client-menu-nav-list">
                  {menu.categories.map((cat) => (
                    <li key={cat.id}>
                      <button type="button" className="client-menu-nav-item" onClick={() => scrollToCategory(cat.id)}>
                        <span>{cat.name}</span>
                        <span className="muted">{cat.items.length} plats</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sheetTab === "cart" && (
              <div className="client-menu-sheet-body client-menu-sheet-cart">
                {cart.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Ton panier est vide. Ajoute des plats depuis le menu.
                  </p>
                ) : (
                  <>
                    <div className="cart-lines client-menu-cart-lines">
                      {cart.map((line, idx) => (
                        <div
                          key={`${line.menuItemId}-${optionSetKey(line.optionIds)}`}
                          className="cart-line"
                        >
                          <div className="cart-line-info">
                            <strong>{line.name}</strong>
                            {line.optionNames.length > 0 && (
                              <span className="muted">{line.optionNames.join(", ")}</span>
                            )}
                            <span className="muted">{(line.unitPriceCents / 100).toFixed(2)} EUR / unité</span>
                          </div>
                          <div className="cart-line-actions">
                            <div className="qty-stepper">
                              <button
                                type="button"
                                className="btn-secondary qty-btn"
                                onClick={() =>
                                  setCart((prev) =>
                                    prev
                                      .map((c, i) => (i === idx ? { ...c, quantity: c.quantity - 1 } : c))
                                      .filter((c) => c.quantity > 0)
                                  )
                                }
                                aria-label="Diminuer"
                              >
                                −
                              </button>
                              <span className="qty-value">{line.quantity}</span>
                              <button
                                type="button"
                                className="btn-secondary qty-btn"
                                onClick={() =>
                                  setCart((prev) =>
                                    prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + 1 } : c))
                                  )
                                }
                                aria-label="Augmenter"
                              >
                                +
                              </button>
                            </div>
                            <strong className="cart-line-total">
                              {((line.unitPriceCents * line.quantity) / 100).toFixed(2)} EUR
                            </strong>
                            <button
                              type="button"
                              className="btn-danger qty-btn"
                              onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label="Retirer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="client-menu-cart-footer">
                      <div className="row-between" style={{ width: "100%" }}>
                        <strong>Total</strong>
                        <strong>{(total / 100).toFixed(2)} EUR</strong>
                      </div>
                      <div className="client-menu-cart-actions">
                        <button type="button" className="btn-secondary" onClick={() => setCart([])}>
                          Vider
                        </button>
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
                        >
                          Commander
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {orderId && (
        <section className="panel order-ticket client-menu-ticket">
          <div className="row-between">
            <h3 className="panel-title">Commande envoyée</h3>
            <span className={`status ${statusClass(orderStatus)}`}>{orderStatus}</span>
          </div>
          {orderNumber && <p className="muted">Commande #{orderNumber}</p>}
          <p className="muted">Table: {menu.table.name}</p>
          <p className="muted">Total: {(placedTotal / 100).toFixed(2)} EUR</p>
          <div className="stack" style={{ marginTop: 8 }}>
            {placedItems.map((line) => (
              <div key={line.id} className="menu-item">
                <div className="row-between">
                  <strong>
                    {line.quantity}x {line.nameSnapshot}
                  </strong>
                  <strong>{(line.lineTotalCents / 100).toFixed(2)} EUR</strong>
                </div>
                {line.options.length > 0 && (
                  <p className="muted">
                    {line.options
                      .map((o) => `${o.nameSnapshot} (+${(o.priceDeltaCents / 100).toFixed(2)} EUR)`)
                      .join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function statusClass(status: string) {
  if (status === "PLACED") return "status-placed";
  if (status === "PREPARING") return "status-preparing";
  if (status === "READY") return "status-ready";
  return "status-served";
}
