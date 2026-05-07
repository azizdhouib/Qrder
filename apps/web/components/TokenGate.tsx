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
      <div className="panel">
        <div className="row-between">
          <h3 className="panel-title">JWT requis</h3>
          <span className="pill">Secure access</span>
        </div>
        <p className="muted">Colle ici le token obtenu via /auth/login ou /auth/register.</p>
        <input
          placeholder="Bearer token"
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
