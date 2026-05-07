"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("qrder_token");
    router.replace(token ? "/dashboard" : "/dashboard/auth");
  }, [router]);

  return (
    <main className="container">
      <section className="hero">
        <h1 className="hero-title">Redirection...</h1>
        <p className="hero-subtitle">Ouverture de votre espace restaurant.</p>
      </section>
    </main>
  );
}
