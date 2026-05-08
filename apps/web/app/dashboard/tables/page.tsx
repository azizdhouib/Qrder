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
                  <svg
                    className="table-card-icon-svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.65"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 8h16v2.5H4z" />
                    <path d="M7 10.5V18M12 10.5V18M17 10.5V18" />
                    <path d="M7 18v2M17 18v2" />
                  </svg>
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
                  <svg className="table-action-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M6.25 4.75h5.5a.75.75 0 010 1.5H8.56l10.47 10.47a.75.75 0 11-1.06 1.06L7.5 7.31v3.19a.75.75 0 01-1.5 0v-5.5a.75.75 0 01.75-.75zm12 3a.75.75 0 01.75.75v11a.75.75 0 01-.75.75h-11a.75.75 0 01-.75-.75v-4a.75.75 0 011.5 0v3.25h9.5v-9.5H16a.75.75 0 010-1.5h2.25z"
                    />
                  </svg>
                  Ouvrir l&apos;interface client
                </button>
              )}
              <button
                className="table-action"
                onClick={() => downloadQr(table.id, table.name, token)}
              >
                <svg className="table-action-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2.25a.75.75 0 01.75.75v10.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3a.75.75 0 01.75-.75zm-6.25 14a.75.75 0 00-.75.75v2.5c0 .69.56 1.25 1.25 1.25h11.5c.69 0 1.25-.56 1.25-1.25v-2.5a.75.75 0 011.5 0v2.5A2.75 2.75 0 0118.5 22h-11A2.75 2.75 0 014.75 19.25v-2.5a.75.75 0 01.75-.75z"
                  />
                </svg>
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
