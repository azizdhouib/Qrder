"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSuperAdminToken, getSuperAdminToken, superAdminFetchInit } from "@/lib/superAdminClient";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  suspended: boolean;
  createdAt: string;
  _count: { users: number };
};

export default function SuperAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [currency, setCurrency] = useState("EUR");

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/super-admin/restaurants", superAdminFetchInit());
    if (res.status === 401) {
      clearSuperAdminToken();
      router.replace("/super-admin/login");
      return;
    }
    if (!res.ok) {
      const t = await res.text();
      setLoadError(t || "Impossible de charger les restaurants.");
      return;
    }
    const data = (await res.json()) as RestaurantRow[];
    setRows(data);
  }, [router]);

  useEffect(() => {
    if (!getSuperAdminToken()) {
      router.replace("/super-admin/login");
      return;
    }
    void load();
  }, [load, router]);

  async function logout() {
    clearSuperAdminToken();
    await fetch("/api/super-admin/logout", { method: "POST" });
    router.replace("/super-admin/login");
    router.refresh();
  }

  async function createRestaurant(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ownerPassword,
        currency: currency.trim().toUpperCase() || "EUR"
      };
      const s = slug.trim();
      if (s) body.slug = s;

      const res = await fetch(
        "/api/super-admin/restaurants",
        superAdminFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
      );
      const data = (await res.json()) as { message?: string; issues?: unknown };
      if (!res.ok) {
        if (res.status === 401) {
          clearSuperAdminToken();
          router.replace("/super-admin/login");
          return;
        }
        setFormError(
          data.message ?? (Array.isArray(data.issues) ? "Données invalides." : "Création refusée.")
        );
        return;
      }
      setName("");
      setSlug("");
      setOwnerEmail("");
      setOwnerPassword("");
      setCurrency("EUR");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function setSuspended(id: string, suspended: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(
        `/api/super-admin/restaurants/${id}`,
        superAdminFetchInit({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suspended })
        })
      );
      if (res.status === 401) {
        clearSuperAdminToken();
        router.replace("/super-admin/login");
        return;
      }
      if (!res.ok) {
        const j = (await res.json()) as { message?: string };
        alert(j.message ?? "Action impossible.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function removeRestaurant(r: RestaurantRow) {
    if (
      !confirm(
        `Supprimer définitivement « ${r.name} » et ses commandes associées ? Cette action est irréversible.`
      )
    ) {
      return;
    }
    setBusyId(r.id);
    try {
      const res = await fetch(
        `/api/super-admin/restaurants/${r.id}`,
        superAdminFetchInit({ method: "DELETE" })
      );
      if (res.status === 401) {
        clearSuperAdminToken();
        router.replace("/super-admin/login");
        return;
      }
      if (!res.ok) {
        const j = (await res.json()) as { message?: string };
        alert(j.message ?? "Suppression impossible.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="container stack" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className="hero" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", width: "100%" }}>
          <span className="badge">Super admin</span>
          <div style={{ marginLeft: "auto" }}>
            <button type="button" className="btn-outline-primary" onClick={() => void logout()}>
              Déconnexion
            </button>
          </div>
        </div>
        <h1 className="hero-title">Restaurants</h1>
        <p className="hero-subtitle">Créer, suspendre ou supprimer des établissements.</p>
      </header>

      {loadError ? (
        <p role="alert" style={{ color: "var(--destructive)", margin: 0 }}>
          {loadError}{" "}
          <button type="button" className="btn-outline-primary" style={{ display: "inline" }} onClick={() => void load()}>
            Réessayer
          </button>
        </p>
      ) : null}

      <section className="stack panel" style={{ gap: "1rem", padding: "1.25rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Nouveau restaurant</h2>
        <form className="stack" style={{ gap: "0.75rem" }} onSubmit={(e) => void createRestaurant(e)}>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))"
            }}
          >
            <label className="form-field">
              <span className="form-label">Nom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} disabled={creating} />
            </label>
            <label className="form-field">
              <span className="form-label">Slug (optionnel)</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="auto si vide"
                pattern="[a-z0-9-]*"
                disabled={creating}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Email propriétaire</span>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                disabled={creating}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Mot de passe propriétaire</span>
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                required
                minLength={6}
                disabled={creating}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Devise</span>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} disabled={creating} />
            </label>
          </div>
          {formError ? (
            <p className="auth-alert auth-alert-error" role="alert">
              {formError}
            </p>
          ) : null}
          <button type="submit" className="btn-primary-ios" disabled={creating}>
            {creating ? "Création…" : "Créer le restaurant"}
          </button>
        </form>
      </section>

      <section className="stack" style={{ gap: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Liste</h2>
        <div style={{ overflowX: "auto", borderRadius: "var(--radius-panel)", border: "1px solid var(--border)" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem"
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}>
                <th style={{ textAlign: "left", padding: "0.65rem 0.75rem" }}>Nom</th>
                <th style={{ textAlign: "left", padding: "0.65rem 0.75rem" }}>Slug</th>
                <th style={{ textAlign: "left", padding: "0.65rem 0.75rem" }}>Devise</th>
                <th style={{ textAlign: "left", padding: "0.65rem 0.75rem" }}>Utilisateurs</th>
                <th style={{ textAlign: "left", padding: "0.65rem 0.75rem" }}>Statut</th>
                <th style={{ textAlign: "left", padding: "0.65rem 0.75rem" }}>Créé</th>
                <th style={{ textAlign: "right", padding: "0.65rem 0.75rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{r.name}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <code style={{ fontSize: "0.85em" }}>{r.slug}</code>
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{r.currency}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{r._count.users}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    {r.suspended ? (
                      <span className="badge" style={{ background: "var(--destructive)", color: "var(--destructive-foreground)" }}>
                        Suspendu
                      </span>
                    ) : (
                      <span className="badge">Actif</span>
                    )}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>{new Date(r.createdAt).toLocaleString("fr-FR")}</td>
                  <td style={{ padding: "0.6rem 0.75rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", justifyContent: "flex-end" }}>
                      {r.suspended ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busyId === r.id}
                          onClick={() => void setSuspended(r.id, false)}
                        >
                          Réactiver
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busyId === r.id}
                          onClick={() => void setSuspended(r.id, true)}
                        >
                          Suspendre
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={busyId === r.id}
                        onClick={() => void removeRestaurant(r)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !loadError ? (
            <p style={{ padding: "1rem", margin: 0, color: "var(--muted-foreground)" }}>Aucun restaurant.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
