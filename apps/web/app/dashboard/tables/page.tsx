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
        <h3 className="panel-title" style={{ marginBottom: 6 }}>
          Ajouter une table
        </h3>
        <p className="muted" style={{ margin: "0 0 10px" }}>
          Donne un nom court (ex. T1, T2, Terrasse 3) - un QR unique sera généré.
        </p>
        <div className="tables-add-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la table"
          />
          <button
            onClick={async () => {
              if (!name.trim()) return;
              await apiFetch("/tables", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: name.trim() })
              });
              setName("");
              await load();
            }}
          >
            Créer la table
          </button>
        </div>
      </div>

      <div className="tables-grid">
        {tables.map((table) => (
          <div key={table.id} className="panel table-card">
            <div className="table-card-header">
              <div className="table-card-title">
                <span className="table-card-icon" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/table.png" alt="" />
                </span>
                <span className="table-card-name">{table.name}</span>
              </div>
              <span className="pill">QR prêt</span>
            </div>
            <div className="table-card-actions">
              {restaurantSlug && origin && (
                <button
                  className="btn-secondary table-action"
                  onClick={() =>
                    window.open(
                      `${origin}/r/${restaurantSlug}/t/${table.qrToken}`,
                      "_blank"
                    )
                  }
                >
                  <span aria-hidden="true">🔗</span>
                  Ouvrir l&apos;interface client
                </button>
              )}
              <button
                className="table-action"
                onClick={() => downloadQr(table.id, table.name, token)}
              >
                <span aria-hidden="true">⬇</span>
                Télécharger le QR
              </button>
            </div>
          </div>
        ))}
        {tables.length === 0 && (
          <div className="panel">
            <p className="muted" style={{ margin: 0 }}>
              Aucune table - crée la première ci-dessus.
            </p>
          </div>
        )}
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
