"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { DashboardNav } from "@/components/DashboardNav";
import { DashboardSessionBar } from "@/components/DashboardSessionBar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);

  const isAuthPage = useMemo(() => pathname === "/dashboard/auth", [pathname]);
  const navItems = [
    { href: "/dashboard", label: "Vue d'ensemble" },
    { href: "/dashboard/tables", label: "Tables + QR" },
    { href: "/dashboard/menu", label: "Menu" },
    { href: "/dashboard/kitchen", label: "Cuisine" },
    { href: "/dashboard/history", label: "Historique" }
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

  useEffect(() => {
    if (!token || isAuthPage) {
      setRestaurantName(null);
      return;
    }
    apiFetch<{ name: string }>("/me/restaurant", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => setRestaurantName(r.name))
      .catch(() => setRestaurantName(null));
  }, [token, isAuthPage]);

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
          <header className="dashboard-top-bar">
            <div className="dashboard-top-bar-inner">
              <div className="dashboard-top-brand">
                <span className="dashboard-top-logo" aria-hidden="true" />
                <span className="dashboard-top-app">Qrder</span>
                {restaurantName ? (
                  <span className="dashboard-top-restaurant-badge" title={restaurantName}>
                    {restaurantName}
                  </span>
                ) : null}
              </div>
              <DashboardNav items={navItems} pathname={pathname} />
              <DashboardSessionBar
                onLogout={() => {
                  localStorage.removeItem("qrder_token");
                  router.replace("/dashboard/auth");
                }}
              />
            </div>
          </header>
          <div className="dashboard-main-content">{children}</div>
        </div>
      )}
      {(!token || isAuthPage) && children}
    </>
  );
}
