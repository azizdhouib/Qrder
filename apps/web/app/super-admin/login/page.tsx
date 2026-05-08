"use client";

import { Suspense, FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSuperAdminToken, setSuperAdminToken } from "@/lib/superAdminClient";

function SuperAdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const from =
    search.get("from") && search.get("from")!.startsWith("/super-admin") ? search.get("from")! : "/super-admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getSuperAdminToken();
        if (!token) return;
        const res = await fetch("/api/super-admin/session", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled && res.ok) router.replace(from);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = (await res.json()) as { message?: string; token?: string };
      if (!res.ok) {
        setError(data.message ?? "Connexion impossible.");
        return;
      }
      if (!data.token) {
        setError("Réponse serveur invalide.");
        return;
      }
      setSuperAdminToken(data.token);
      window.location.assign(from);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="container auth-page">
        <section className="panel auth-card">
          <p className="auth-card-lead">Vérification…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container auth-page">
      <section className="panel auth-card">
        <header className="auth-card-header">
          <span className="badge">Super admin</span>
          <h1 className="auth-card-title">Connexion</h1>
          <p className="auth-card-lead">
            Email et mot de passe du compte plateforme (seed <code>PLATFORM_ADMIN_EMAIL</code> /{" "}
            <code>PLATFORM_ADMIN_PASSWORD</code>). La session reste dans ce navigateur jusqu&apos;à déconnexion ou
            fermeture de l&apos;onglet.
          </p>
        </header>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="auth-form-fields">
            <label className="form-field">
              <span className="form-label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Mot de passe</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </label>
          </div>
          {error ? (
            <p className="auth-alert auth-alert-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary-ios auth-submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function SuperAdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="container auth-page">
          <section className="panel auth-card">
            <p className="auth-card-lead">Chargement…</p>
          </section>
        </main>
      }
    >
      <SuperAdminLoginForm />
    </Suspense>
  );
}
