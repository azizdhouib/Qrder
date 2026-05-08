"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSuperAdminToken, getSuperAdminToken, superAdminFetchInit } from "@/lib/superAdminClient";

type UserRow = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

type DirectoryRestaurant = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  suspended: boolean;
  createdAt: string;
  users: UserRow[];
};

function roleLabelFr(role: string): string {
  switch (role) {
    case "OWNER":
      return "Propriétaire";
    case "MANAGER":
      return "Gérant";
    case "KITCHEN":
      return "Cuisine";
    default:
      return role;
  }
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [directory, setDirectory] = useState<DirectoryRestaurant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [currency, setCurrency] = useState("EUR");

  /** Mot de passe affichable après régénération (session navigateur uniquement). */
  const [plainByUser, setPlainByUser] = useState<Record<string, string>>({});
  const [revealByUser, setRevealByUser] = useState<Record<string, boolean>>({});
  const [regenerateDialog, setRegenerateDialog] = useState<{
    userId: string;
    email: string;
    restaurantName: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/super-admin/directory", superAdminFetchInit());
    if (res.status === 401) {
      clearSuperAdminToken();
      router.replace("/super-admin/login");
      return;
    }
    if (!res.ok) {
      const t = await res.text();
      setLoadError(t || "Impossible de charger l’annuaire.");
      return;
    }
    const data = (await res.json()) as DirectoryRestaurant[];
    setDirectory(data);
  }, [router]);

  useEffect(() => {
    if (!getSuperAdminToken()) {
      router.replace("/super-admin/login");
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    if (!regenerateDialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRegenerateDialog(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [regenerateDialog]);

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

  async function removeRestaurant(r: DirectoryRestaurant) {
    if (
      !confirm(
        `Supprimer définitivement « ${r.name} » et ses commandes associées ? Cette action est irréversible.`
      )
    ) {
      return;
    }
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/super-admin/restaurants/${r.id}`, superAdminFetchInit({ method: "DELETE" }));
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
      setPlainByUser((prev) => {
        const next = { ...prev };
        for (const u of r.users) delete next[u.id];
        return next;
      });
      setRevealByUser((prev) => {
        const next = { ...prev };
        for (const u of r.users) delete next[u.id];
        return next;
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function executeRegeneratePassword(userId: string) {
    setRegenerateDialog(null);
    setBusyUserId(userId);
    try {
      const res = await fetch(
        `/api/super-admin/users/${encodeURIComponent(userId)}/reset-password`,
        superAdminFetchInit({ method: "POST" })
      );
      const data = (await res.json()) as { message?: string; password?: string };
      if (res.status === 401) {
        clearSuperAdminToken();
        router.replace("/super-admin/login");
        return;
      }
      if (!res.ok || !data.password) {
        alert(data.message ?? "Régénération impossible.");
        return;
      }
      setPlainByUser((p) => ({ ...p, [userId]: data.password! }));
      setRevealByUser((p) => ({ ...p, [userId]: true }));
    } finally {
      setBusyUserId(null);
    }
  }

  function toggleReveal(userId: string) {
    setRevealByUser((p) => ({ ...p, [userId]: !p[userId] }));
  }

  return (
    <main className="container stack super-admin-page" style={{ paddingTop: "2rem", paddingBottom: "4rem" }}>
      <header className="hero" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", width: "100%" }}>
          <span className="badge">Super admin</span>
          <div style={{ marginLeft: "auto" }}>
            <button type="button" className="btn-outline-primary" onClick={() => void logout()}>
              Déconnexion
            </button>
          </div>
        </div>
        <h1 className="hero-title">Restaurants &amp; comptes</h1>
        <p className="hero-subtitle">
          Chaque établissement regroupe ses identifiants internes. Les mots de passe sont stockés de façon sécurisée :
          utilise « Régénérer » pour obtenir un nouveau mot de passe affichable une fois dans cette session.
        </p>
      </header>

      {loadError ? (
        <p role="alert" style={{ color: "var(--destructive)", margin: 0 }}>
          {loadError}{" "}
          <button type="button" className="btn-outline-primary" style={{ display: "inline" }} onClick={() => void load()}>
            Réessayer
          </button>
        </p>
      ) : null}

      <section className="stack panel super-admin-form" style={{ gap: "1rem", padding: "1.25rem" }}>
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

      <section className="stack super-admin-directory" style={{ gap: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Comptes par établissement</h2>
        {directory.length === 0 && !loadError ? (
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>Aucun restaurant.</p>
        ) : null}
        {directory.map((r) => (
          <details
            key={r.id}
            className="super-admin-restaurant panel"
            style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-panel)", overflow: "hidden" }}
            open
          >
            <summary
              className="super-admin-restaurant-summary"
              style={{
                cursor: "pointer",
                padding: "0.85rem 1rem",
                background: "var(--secondary)",
                fontWeight: 600,
                listStyle: "none",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              <span>{r.name}</span>
              <code style={{ fontSize: "0.8em", fontWeight: 500 }}>{r.slug}</code>
              <span style={{ fontSize: "0.85rem", opacity: 0.85 }}>{r.currency}</span>
              <span style={{ fontSize: "0.85rem", opacity: 0.85 }}>{r.users.length} compte{r.users.length !== 1 ? "s" : ""}</span>
              {r.suspended ? (
                <span className="badge" style={{ background: "var(--destructive)", color: "var(--destructive-foreground)" }}>
                  Suspendu
                </span>
              ) : (
                <span className="badge">Actif</span>
              )}
            </summary>
            <div style={{ padding: "0.75rem 1rem 1rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
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
                  Supprimer l&apos;établissement
                </button>
              </div>
              <div style={{ overflowX: "auto", borderRadius: "calc(var(--radius-panel) - 4px)", border: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklch, var(--secondary), transparent 35%)" }}>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.65rem" }}>Email</th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.65rem" }}>Rôle</th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.65rem" }}>Créé</th>
                      <th style={{ textAlign: "left", padding: "0.55rem 0.65rem" }}>Mot de passe</th>
                      <th style={{ textAlign: "right", padding: "0.55rem 0.65rem" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.users.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "0.75rem", color: "var(--muted-foreground)" }}>
                          Aucun utilisateur.
                        </td>
                      </tr>
                    ) : (
                      r.users.map((u) => {
                        const plain = plainByUser[u.id];
                        const revealed = Boolean(revealByUser[u.id]);
                        const displayPwd = plain && revealed ? plain : "••••••••";
                        return (
                          <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.5rem 0.65rem", wordBreak: "break-all" }}>{u.email}</td>
                            <td style={{ padding: "0.5rem 0.65rem" }}>{roleLabelFr(u.role)}</td>
                            <td style={{ padding: "0.5rem 0.65rem", whiteSpace: "nowrap" }}>
                              {new Date(u.createdAt).toLocaleString("fr-FR")}
                            </td>
                            <td style={{ padding: "0.5rem 0.65rem" }}>
                              <code
                                style={{
                                  fontSize: "0.82rem",
                                  userSelect: plain ? "all" : "none",
                                  letterSpacing: plain && revealed ? "normal" : "0.08em"
                                }}
                              >
                                {displayPwd}
                              </code>
                              {!plain ? (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.72rem",
                                    color: "var(--muted-foreground)",
                                    marginTop: "0.25rem"
                                  }}
                                >
                                  Non lisible — régénère pour définir un mot de passe connu.
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: "0.5rem 0.65rem" }}>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "0.35rem",
                                  justifyContent: "flex-end"
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn-secondary btn-compact"
                                  disabled={!plain || busyUserId === u.id}
                                  onClick={() => toggleReveal(u.id)}
                                  title={plain ? (revealed ? "Masquer" : "Afficher") : "Régénère d’abord le mot de passe"}
                                >
                                  {revealed ? "Masquer" : "Afficher"}
                                </button>
                                <button
                                  type="button"
                                  className="btn-outline-primary btn-compact"
                                  disabled={busyUserId === u.id || !plain}
                                  onClick={() => {
                                    if (plain) void navigator.clipboard.writeText(plain).catch(() => undefined);
                                  }}
                                  title="Copier le mot de passe généré dans cette session"
                                >
                                  Copier
                                </button>
                                <button
                                  type="button"
                                  className="btn-primary-ios btn-compact"
                                  disabled={busyUserId === u.id || busyId === r.id}
                                  onClick={() =>
                                    setRegenerateDialog({
                                      userId: u.id,
                                      email: u.email,
                                      restaurantName: r.name
                                    })
                                  }
                                >
                                  Régénérer
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ))}
      </section>

      {regenerateDialog ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0 0 0 / 0.48)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: "1rem"
          }}
          onClick={() => setRegenerateDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="super-admin-regen-title"
            aria-describedby="super-admin-regen-desc"
            style={{
              maxWidth: "26rem",
              width: "100%",
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-panel)",
              padding: "1.25rem",
              boxShadow: "0 24px 48px oklch(0 0 0 / 0.2)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="super-admin-regen-title"
              style={{ margin: "0 0 0.65rem", fontSize: "1.08rem", fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              Confirmer la régénération
            </h2>
            <div
              id="super-admin-regen-desc"
              role="alert"
              style={{
                marginBottom: "1rem",
                padding: "0.75rem 0.85rem",
                borderRadius: "0.5rem",
                border: "1px solid color-mix(in oklch, var(--destructive), transparent 45%)",
                background: "color-mix(in oklch, var(--destructive), transparent 90%)",
                color: "var(--destructive)",
                fontSize: "0.875rem",
                lineHeight: 1.5
              }}
            >
              <strong>Attention</strong> — tu es <strong>sûr</strong> de vouloir <strong>remplacer le mot de passe</strong> du compte{" "}
              <code style={{ wordBreak: "break-all" }}>{regenerateDialog.email}</code> (
              {regenerateDialog.restaurantName}). L’<strong>ancien mot cessera immédiatement de fonctionner</strong> et
              la personne ne pourra plus se connecter tant qu’elle n’aura pas le nouveau.
            </div>
            <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)", lineHeight: 1.45 }}>
              Cette action est utile en support, mais vérifie bien que tu communiques le nouveau mot de passe de façon
              sécurisée au membre concerné.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setRegenerateDialog(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void executeRegeneratePassword(regenerateDialog.userId)}
              >
                Oui, régénérer le mot de passe
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
