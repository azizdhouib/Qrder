"use client";

import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type Table = { id: string; name: string; qrToken: string };
type Restaurant = { slug: string };

export default function TablesPage() {
  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Tables</span>
        <h1 className="hero-title">Gestion des tables + QR</h1>
        <p className="hero-subtitle">Crée tes tables et distribue les QR codes en un clic.</p>
      </section>
      <TokenGate>{(token) => <TablesManager token={token} />}</TokenGate>
    </main>
  );
}

function TablesManager({ token }: { token: string }) {
  const [name, setName] = useState("T1");
  const [tables, setTables] = useState<Table[]>([]);
  const [restaurantSlug, setRestaurantSlug] = useState("");
  const [origin, setOrigin] = useState("");

  async function load() {
    const [tableResult, restaurant] = await Promise.all([
      apiFetch<Table[]>("/tables", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      apiFetch<Restaurant>("/me/restaurant", {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    setTables(tableResult);
    setRestaurantSlug(restaurant.slug);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack">
      <div className="panel">
        <h3 className="panel-title">Ajouter une table</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ marginTop: 8 }}>
          <button
            onClick={async () => {
              await apiFetch("/tables", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name })
              });
              setName("");
              await load();
            }}
          >
            Créer
          </button>
        </div>
      </div>

      <div className="grid grid-2">
        {tables.map((table) => (
          <div key={table.id} className="panel">
            <div className="row-between">
              <strong>{table.name}</strong>
              <span className="pill">QR prêt</span>
            </div>
            <p className="muted">Token: {table.qrToken.slice(0, 12)}...</p>
            {restaurantSlug && origin && (
              <p className="muted">
                URL client: {origin}/r/{restaurantSlug}/t/{table.qrToken}
              </p>
            )}
            <div className="row">
              {restaurantSlug && origin && (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    window.open(
                      `${origin}/r/${restaurantSlug}/t/${table.qrToken}`,
                      "_blank"
                    )
                  }
                >
                  Ouvrir interface client
                </button>
              )}
              {restaurantSlug && origin && (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    navigator.clipboard.writeText(`${origin}/r/${restaurantSlug}/t/${table.qrToken}`)
                  }
                >
                  Copier lien client
                </button>
              )}
            </div>
            <button
              className="btn-secondary"
              onClick={() => downloadQr(table.id, table.name, token)}
            >
              Télécharger QR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
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
