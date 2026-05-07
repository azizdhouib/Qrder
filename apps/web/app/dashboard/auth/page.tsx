"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type AuthResponse = {
  token: string;
  restaurant: { id: string; name: string; slug: string };
};

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [restaurantName, setRestaurantName] = useState("Mon Resto");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  async function handleRegister() {
    try {
      setErrorMessage("");
      const result = await apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, restaurantName })
      });
      localStorage.setItem("qrder_token", result.token);
      setMessage(`Compte cree: ${result.restaurant.name}`);
      router.push("/dashboard");
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (text.includes("Email already used")) {
        setErrorMessage("Cet identifiant est déjà utilisé.");
      } else {
        setErrorMessage("Impossible de créer le compte. Vérifie les informations.");
      }
    }
  }

  async function handleLogin() {
    try {
      setErrorMessage("");
      const result = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("qrder_token", result.token);
      setMessage(`Connecte: ${result.restaurant.name}`);
      router.push("/dashboard");
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (text.includes("Invalid credentials")) {
        setErrorMessage("Identifiants incorrects. Vérifie ton email et ton mot de passe.");
      } else {
        setErrorMessage("Connexion impossible pour le moment. Réessaie dans un instant.");
      }
    }
  }

  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Onboarding</span>
        <h1 className="hero-title">Inscription / connexion</h1>
        <p className="hero-subtitle">Crée ton espace restaurant puis connecte-toi en quelques secondes.</p>
      </section>

      <section className="panel">
        <div className="row" style={{ marginBottom: 8 }}>
          <button
            className={mode === "login" ? "" : "btn-secondary"}
            onClick={() => {
              setMode("login");
              setErrorMessage("");
              setMessage("");
            }}
          >
            Connexion
          </button>
          <button
            className={mode === "register" ? "" : "btn-secondary"}
            onClick={() => {
              setMode("register");
              setErrorMessage("");
              setMessage("");
            }}
          >
            Inscription
          </button>
        </div>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Identifiant (email)"
        />
        <div style={{ height: 8 }} />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mdp"
          type="password"
        />
        {mode === "register" && (
          <>
            <div style={{ height: 8 }} />
            <input
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Nom du restaurant"
            />
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {mode === "register" ? (
            <button onClick={handleRegister}>Créer le compte</button>
          ) : (
            <button onClick={handleLogin}>Se connecter</button>
          )}
        </div>
        {errorMessage && (
          <p className="muted" style={{ color: "#fca5a5" }}>
            {errorMessage}
          </p>
        )}
        {message && <p className="muted">{message}</p>}
      </section>
    </main>
  );
}
