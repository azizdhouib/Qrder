"use client";

import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

type Props = {
  children: (token: string) => ReactNode;
};

export function TokenGate({ children }: Props) {
  /** `null` = lecture localStorage pas encore faite (évite « Session requise » un frame avant le token). */
  const [token, setToken] = useState<string | null>(null);

  useLayoutEffect(() => {
    try {
      setToken(localStorage.getItem("qrder_token") ?? "");
    } catch {
      setToken("");
    }
  }, []);

  if (token === null) {
    return (
      <div className="panel token-gate-panel" aria-busy="true">
        <p className="muted text-[15px]">Chargement de la session…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="panel token-gate-panel">
        <div className="row-between">
          <h3 className="panel-title">Session requise</h3>
          <span className="label-kicker" style={{ margin: 0 }}>
            Accès sécurisé
          </span>
        </div>
        <p className="muted">
          Colle ici la clé d&apos;accès fournie après connexion sur la page équipe lorsque le navigateur ne
          l&apos;a pas enregistrée.
        </p>
        <input
          placeholder="Clé d'accès"
          onChange={(e) => setToken(e.target.value)}
          value={token}
        />
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              localStorage.setItem("qrder_token", token);
              window.location.reload();
            }}
          >
            Sauvegarder
          </button>
        </div>
      </div>
    );
  }

  return <>{children(token)}</>;
}
