"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type AuthResponse = {
  token: string;
  role: "OWNER" | "MANAGER" | "KITCHEN";
  restaurant: { id: string; name: string; slug: string };
};

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleLogin() {
    try {
      setPending(true);
      setErrorMessage("");
      const result = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("qrder_token", result.token);
      setMessage(`Connecté : ${result.restaurant.name}`);
      router.push("/dashboard");
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (text.includes("Invalid credentials")) {
        setErrorMessage("Identifiants incorrects. Vérifie ton email et ton mot de passe.");
      } else {
        setErrorMessage("Connexion impossible pour le moment. Réessaie dans un instant.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="container auth-page">
      <Link href="/" className="auth-back">
        ← Accueil
      </Link>

      <section className="panel auth-card">
        <header className="auth-card-header">
          <span className="badge">Espace équipe</span>
          <h1 className="auth-card-title">Connexion</h1>
          <p className="auth-card-lead">
            Les comptes sont fournis par l&apos;administrateur de ton établissement. Saisis l&apos;email et le mot de passe
            qui t&apos;ont été communiqués.
          </p>
        </header>

        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            void handleLogin();
          }}
        >
          <div className="auth-form-fields">
            <label className="form-field">
              <span className="form-label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@restaurant.fr"
                required
                disabled={pending}
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
                placeholder="••••••••"
                required
                minLength={1}
                disabled={pending}
              />
            </label>
          </div>

          {errorMessage ? (
            <p className="auth-alert auth-alert-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {message ? (
            <p className="auth-alert auth-alert-success" role="status">
              {message}
            </p>
          ) : null}

          <button type="submit" className="btn-primary-ios auth-submit" disabled={pending}>
            {pending ? "Patience…" : "Se connecter"}
          </button>
        </form>

        <p className="auth-footer-note">
          Besoin d&apos;un accès ? Contacte le gérant du restaurant ou l&apos;administrateur Qrder.
        </p>
      </section>
    </main>
  );
}
