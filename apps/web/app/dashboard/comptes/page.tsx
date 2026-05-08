"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TokenGate } from "@/components/TokenGate";

type UserRole = "OWNER" | "MANAGER" | "KITCHEN";

type Me = {
  userId: string;
  role: UserRole;
  restaurant: { name: string };
};

type TeamUser = {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
};

function roleLabel(role: UserRole): string {
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

function parseApiError(err: unknown): string {
  if (!(err instanceof Error) || !err.message) {
    return "Une erreur est survenue.";
  }
  try {
    const j = JSON.parse(err.message) as { message?: string };
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return err.message;
}

export default function ComptesPage() {
  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Paramètres</span>
        <h1 className="hero-title">Comptes équipe</h1>
        <p className="hero-subtitle">
          Ajoute des comptes gérant ou cuisine pour ton établissement. Chaque membre se connecte avec son
          email et le mot de passe que tu définis.
        </p>
      </section>
      <TokenGate>{(token) => <ComptesManager token={token} />}</TokenGate>
    </main>
  );
}

function ComptesManager({ token }: { token: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"MANAGER" | "KITCHEN">("KITCHEN");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [meRes, team] = await Promise.all([
      apiFetch<Me>("/me", { headers: { Authorization: `Bearer ${token}` } }),
      apiFetch<TeamUser[]>("/team/users", {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);
    setMe(meRes);
    setUsers(team);
    if (meRes.role === "MANAGER") setRole("KITCHEN");
  }, [token]);

  useEffect(() => {
    load().catch((e) => setMessage({ type: "err", text: parseApiError(e) }));
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch("/team/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          role: me?.role === "MANAGER" ? "KITCHEN" : role
        })
      });
      setEmail("");
      setPassword("");
      await load();
      setMessage({ type: "ok", text: "Compte créé. Tu peux communiquer l’email et le mot de passe au membre de l’équipe." });
    } catch (err) {
      setMessage({ type: "err", text: parseApiError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce compte ? La personne ne pourra plus se connecter.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/team/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      await load();
      setMessage({ type: "ok", text: "Compte supprimé." });
    } catch (err) {
      setMessage({ type: "err", text: parseApiError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <p className="muted" style={{ marginTop: 8 }}>
        Chargement…
      </p>
    );
  }

  return (
    <div className="stack comptes-stack">
      {message && (
        <p className={message.type === "ok" ? "comptes-flash comptes-flash--ok" : "comptes-flash comptes-flash--err"}>
          {message.text}
        </p>
      )}

      <section className="panel comptes-panel">
        <h3 className="panel-title">Nouveau compte</h3>
        <p className="muted" style={{ margin: "0 0 1rem" }}>
          {me.role === "OWNER"
            ? "Tu peux créer un gérant (accès complet sauf cette console si tu le souhaites) ou un compte cuisine (cuisine + historique uniquement)."
            : "Tu peux créer des comptes cuisine. Pour un nouveau gérant, contacte le propriétaire."}
        </p>
        <form className="comptes-form" onSubmit={(ev) => void handleCreate(ev)}>
          <label className="form-field">
            <span>Email de connexion</span>
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="prenom.nom@exemple.com"
              required
            />
          </label>
          <label className="form-field">
            <span>Mot de passe provisoire</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="Au moins 6 caractères"
              minLength={6}
              required
            />
          </label>
          {me.role === "OWNER" && (
            <label className="form-field">
              <span>Rôle</span>
              <select value={role} onChange={(ev) => setRole(ev.target.value as "MANAGER" | "KITCHEN")}>
                <option value="KITCHEN">Cuisine</option>
                <option value="MANAGER">Gérant</option>
              </select>
            </label>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Création…" : "Créer le compte"}
          </button>
        </form>
      </section>

      <section className="panel comptes-panel">
        <h3 className="panel-title">Membres ({users.length})</h3>
        <ul className="comptes-list">
          {users.map((u) => {
            const isSelf = u.id === me.userId;
            const canDelete =
              !isSelf &&
              u.role !== "OWNER" &&
              (me.role === "OWNER" || (me.role === "MANAGER" && u.role === "KITCHEN"));

            return (
              <li key={u.id} className="comptes-row">
                <div className="comptes-row-main">
                  <span className="comptes-email">{u.email}</span>
                  <span className="comptes-meta">
                    <span className={`comptes-role comptes-role--${u.role.toLowerCase()}`}>
                      {roleLabel(u.role)}
                    </span>
                    {isSelf && <span className="comptes-you">(toi)</span>}
                  </span>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="btn-danger btn-compact"
                    disabled={busy}
                    onClick={() => void handleDelete(u.id)}
                  >
                    Supprimer
                  </button>
                ) : (
                  <span className="comptes-no-action">—</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
