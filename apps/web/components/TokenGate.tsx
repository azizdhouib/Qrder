"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Props = {
  children: (token: string) => ReactNode;
};

export function TokenGate({ children }: Props) {
  const [token, setToken] = useState("");

  useEffect(() => {
    const current = localStorage.getItem("qrder_token");
    if (current) setToken(current);
  }, []);

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
          Colle ici la clé d&apos;accès affichée après connexion ou inscription lorsque le navigateur ne
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
