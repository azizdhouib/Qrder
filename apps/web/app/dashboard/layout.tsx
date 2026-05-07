"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const isAuthPage = useMemo(() => pathname === "/dashboard/auth", [pathname]);
  const navItems = [
    { href: "/dashboard", label: "Vue d'ensemble", icon: "🏠" },
    { href: "/dashboard/tables", label: "Tables + QR", icon: "🪑" },
    { href: "/dashboard/menu", label: "Menu", icon: "📋" },
    { href: "/dashboard/kitchen", label: "Cuisine", icon: "🍳" },
    { href: "/dashboard/history", label: "Historique", icon: "🧾" }
  ];

  useEffect(() => {
    const stored = localStorage.getItem("qrder_token");
    setToken(stored);

    if (stored && isAuthPage) {
      router.replace("/dashboard");
      return;
    }

    if (!stored && !isAuthPage) {
      router.replace("/dashboard/auth");
      return;
    }

    setReady(true);
  }, [isAuthPage, router]);

  if (!ready) {
    return (
      <main className="container">
        <section className="hero">
          <h1 className="hero-title">Vérification de session...</h1>
          <p className="hero-subtitle">Redirection en cours.</p>
        </section>
      </main>
    );
  }

  if (!token && !isAuthPage) {
    return null;
  }

  return (
    <>
      {token && !isAuthPage && (
        <div className="dashboard-app-shell">
          <aside className="dashboard-shell">
            <div className="row-between">
              <span className="pill">Session active</span>
              <button
                className="btn-danger"
                onClick={() => {
                  localStorage.removeItem("qrder_token");
                  router.replace("/dashboard/auth");
                }}
              >
                Déconnexion
              </button>
            </div>
            <nav className="dashboard-nav">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`dashboard-nav-item ${isActive ? "dashboard-nav-item-active" : ""}`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="dashboard-main-content">{children}</div>
        </div>
      )}
      {(!token || isAuthPage) && children}
    </>
  );
}
