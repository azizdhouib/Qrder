"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api";
import {
  clearCachedDashboardSession,
  loadCachedDashboardSession,
  saveCachedDashboardSession
} from "@/lib/offline/dashboardSessionCache";
import { isLikelyNetworkFailure, readNavigatorOnline } from "@/lib/offline/network";
import { DashboardNav, type DashboardNavItem } from "@/components/DashboardNav";
import { DashboardSessionBar } from "@/components/DashboardSessionBar";

type UserRole = "OWNER" | "MANAGER" | "KITCHEN";

const NAV_FULL: DashboardNavItem[] = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/dashboard/tables", label: "Tables + QR" },
  { href: "/dashboard/menu", label: "Menu" },
  { href: "/dashboard/kitchen", label: "Écran cuisine" },
  { href: "/dashboard/compta", label: "Compta" },
  { href: "/dashboard/export-compta", label: "Export compta" },
  { href: "/dashboard/history", label: "Historique" }
];

const NAV_KITCHEN: DashboardNavItem[] = [
  { href: "/dashboard/kitchen", label: "Écran cuisine" },
  { href: "/dashboard/history", label: "Historique" }
];

function navForRole(role: UserRole): DashboardNavItem[] {
  if (role === "KITCHEN") return NAV_KITCHEN;
  return NAV_FULL;
}

const KITCHEN_PATHS = new Set<string>(["/dashboard/kitchen", "/dashboard/history"]);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<{
    role: UserRole;
    restaurantName: string;
    userId: string;
  } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const isAuthPage = useMemo(() => pathname === "/dashboard/auth", [pathname]);
  const navItems = useMemo(() => (session ? navForRole(session.role) : NAV_FULL), [session]);

  /** Lecture token avant paint pour éviter la course token=null + ready=true (écran vide hors ligne). */
  useLayoutEffect(() => {
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
      setSession(null);
      if (isAuthPage) {
        setSessionReady(true);
      } else if (!token) {
        /* Token pas encore lu depuis localStorage : ne pas marquer « prêt » (sinon shell absent + enfants masqués). */
        setSessionReady(false);
      }
      return;
    }

    setSessionReady(false);
    let cancelled = false;

    (async () => {
      try {
        const r = await apiFetch<{ userId: string; role: UserRole; restaurant: { name: string } }>("/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelled) return;
        const next = { role: r.role, restaurantName: r.restaurant.name, userId: r.userId };
        setSession(next);
        await saveCachedDashboardSession({
          userId: next.userId,
          role: next.role,
          restaurantName: next.restaurantName
        }).catch(() => {});
        setSessionReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 401) {
          await clearCachedDashboardSession().catch(() => {});
          localStorage.removeItem("qrder_token");
          setToken(null);
          setSession(null);
          setSessionReady(true);
          router.replace("/dashboard/auth");
          return;
        }

        const networkish = !readNavigatorOnline() || isLikelyNetworkFailure(err);
        const cached = await loadCachedDashboardSession().catch(() => null);

        if (cached?.userId && cached?.role && cached?.restaurantName) {
          setSession({
            userId: cached.userId,
            role: cached.role,
            restaurantName: cached.restaurantName
          });
          setSessionReady(true);
          return;
        }

        if (networkish) {
          setSession({
            userId: "offline",
            role: "OWNER",
            restaurantName: "Hors ligne"
          });
          setSessionReady(true);
          return;
        }

        setSession({
          userId: "offline",
          role: "OWNER",
          restaurantName: "Qrder"
        });
        setSessionReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, isAuthPage, router]);

  useEffect(() => {
    if (!session || !sessionReady || session.role !== "KITCHEN") return;
    if (pathname === "/dashboard" || !KITCHEN_PATHS.has(pathname)) {
      router.replace("/dashboard/kitchen");
    }
  }, [session, sessionReady, pathname, router]);

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

  if (token && !isAuthPage && !sessionReady) {
    return (
      <main className="container">
        <section className="hero">
          <h1 className="hero-title">Chargement de l&apos;espace…</h1>
          <p className="hero-subtitle">Préparation de ton tableau de bord.</p>
        </section>
      </main>
    );
  }

  return (
    <>
      {token && !isAuthPage && session && (
        <div className="dashboard-app-shell">
          <header className="dashboard-top-bar">
            <div className="dashboard-top-bar-inner">
              <div className="dashboard-top-brand">
                <span className="dashboard-top-logo" aria-hidden="true" />
                <span className="dashboard-top-app">Qrder</span>
                <span className="dashboard-top-restaurant-badge" title={session.restaurantName}>
                  {session.restaurantName}
                </span>
              </div>
              <DashboardNav items={navItems} pathname={pathname} />
              <DashboardSessionBar
                showStaffSettings={session.role !== "KITCHEN"}
                onLogout={() => {
                  void clearCachedDashboardSession().catch(() => {});
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
