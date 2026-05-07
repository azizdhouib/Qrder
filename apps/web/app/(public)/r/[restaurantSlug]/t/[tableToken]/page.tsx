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

  const total = useMemo(
    () => cart.reduce((acc, line) => acc + line.unitPriceCents * line.quantity, 0),
    [cart]
  );

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

  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Commande mobile</span>
        <h1 className="hero-title">{menu.restaurant.name}</h1>
        <p className="hero-subtitle">Table {menu.table.name} - scan vers commande en 2 clics</p>
      </section>

      {menu.categories.map((cat) => (
        <section key={cat.id} className="panel">
          <div className="row-between">
            <h3 className="panel-title">{cat.name}</h3>
            <span className="pill">{cat.items.length} plats</span>
          </div>
          <div className="menu-grid">
            {cat.items.map((item) => (
              <article key={item.id} className="menu-card">
                <div className="menu-card-media">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="menu-thumb" />
                  ) : (
                    <div className="menu-thumb menu-thumb-placeholder">Photo à venir</div>
                  )}
                </div>
                <div className="menu-card-body">
                  <div className="row-between">
                    <strong>{item.name}</strong>
                    <strong>{(item.priceCents / 100).toFixed(2)} EUR</strong>
                  </div>
                  <p className="muted">{item.description ?? "Plat maison"}</p>
                </div>
                <div className="menu-card-footer">
                  <button
                    onClick={() => {
                      const firstOption = item.options[0];
                      const unit = item.priceCents + (firstOption?.priceDeltaCents ?? 0);
                      setCart((prev) => [
                        ...prev,
                        {
                          menuItemId: item.id,
                          name: item.name,
                          quantity: 1,
                          optionIds: firstOption ? [firstOption.id] : [],
                          optionNames: firstOption ? [firstOption.name] : [],
                          unitPriceCents: unit
                        }
                      ]);
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

      <section className="cart-sticky">
        <div className="row-between">
          <div>
            <strong>Panier ({cart.length})</strong>
            <p className="muted">Total: {(total / 100).toFixed(2)} EUR</p>
          </div>
          <button
            disabled={cart.length === 0}
            onClick={async () => {
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
            }}
          >
            Commander
          </button>
        </div>
        {cart.map((line, idx) => (
          <p key={`${line.menuItemId}-${idx}`} className="muted" style={{ margin: "0.35rem 0 0" }}>
            {line.quantity}x {line.name} {line.optionNames.length > 0 ? `(${line.optionNames.join(", ")})` : ""}
          </p>
        ))}
      </section>

      {orderId && (
        <section className="panel order-ticket">
          <div className="row-between">
            <h3 className="panel-title">Commande envoyée</h3>
            <span className={`status ${statusClass(orderStatus)}`}>{orderStatus}</span>
          </div>
          {orderNumber && <p className="muted">Commande #{orderNumber}</p>}
          <p className="muted">Table: {menu.table.name}</p>
          <p className="muted">ID: {orderId}</p>
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
                    {line.options.map((o) => `${o.nameSnapshot} (+${(o.priceDeltaCents / 100).toFixed(2)} EUR)`).join(", ")}
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
