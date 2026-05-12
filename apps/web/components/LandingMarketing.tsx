"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LandingPhoneMock } from "@/components/LandingPhoneMock";
import { QrderLogo } from "@/components/QrderLogo";

const STATS = [
  { value: "3×", label: "plus de tables servies" },
  { value: "−80 %", label: "d'erreurs de commande" },
  { value: "2 min", label: "pour former un serveur" },
] as const;

const STEPS = [
  {
    kicker: "01 — À table",
    title: "Un QR code.\nTout le menu.",
    body: "Vos clients scannent, parcourent les catégories et ajoutent au panier sans friction. Aucune app à télécharger.",
  },
  {
    kicker: "02 — En cuisine",
    title: "Les commandes\narrivent nettes.",
    body: "Chaque ticket arrive structuré : table, horodatage, détails des plats — moins de va-et-vient, zéro incompréhension.",
  },
  {
    kicker: "03 — En salle",
    title: "Le service\nrespire.",
    body: "Moins d'erreurs d'écoute, plus de temps pour l'accueil. Vos équipes se concentrent sur l'essentiel.",
  },
] as const;

const VALUES = [
  { num: "−80 %", title: "d'erreurs", body: "Les clients commandent eux-mêmes, vous validez." },
  { num: "+35 %", title: "de panier moyen", body: "Plus de temps pour suggérer, moins de pression sur l'équipe." },
  { num: "2×", title: "plus rapide", body: "Du scan à la cuisine en quelques secondes, sans intermédiaire." },
  { num: "0", title: "app à télécharger", body: "Le menu fonctionne directement depuis le navigateur du client." },
] as const;

export default function LandingMarketing() {
  const [navDense, setNavDense] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scrollRaf = useRef<number>(0);

  const onScroll = useCallback(() => {
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      setNavDense(window.scrollY > 40);
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const mqListener = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", mqListener);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
      mq.removeEventListener("change", mqListener);
      window.removeEventListener("scroll", onScroll);
    };
  }, [onScroll]);

  useEffect(() => {
    if (reduceMotion) {
      document.querySelectorAll<HTMLElement>(".ap-reveal").forEach((el) => {
        el.classList.add("ap-reveal--in");
      });
      return;
    }
    const els = document.querySelectorAll(".ap-reveal");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("ap-reveal--in");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reduceMotion]);

  return (
    <main className={`ap-landing${reduceMotion ? " ap-landing--no-motion" : ""}`}>

      {/* ── Navigation ── */}
      <header className={`ap-nav${navDense ? " ap-nav--dense" : ""}`}>
        <div className="ap-nav-inner">
          <Link href="/" className="ap-nav-logo" aria-label="Qrder — Accueil">
            <QrderLogo className="ap-logo-img" />
          </Link>
          <nav className="ap-nav-links" aria-label="Navigation principale">
            <a href="#offre">Fonctionnement</a>
            <a href="#resultats">Résultats</a>
            <Link href="/demo" className="ap-nav-demo-link">Démo</Link>
          </nav>
          <Link href="/dashboard/auth" className="ap-btn ap-btn--filled ap-btn--sm">
            Espace équipe
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="ap-hero" id="offre" aria-labelledby="ap-hero-h1">
        <div className="ap-hero-glow" aria-hidden="true" />
        <div className="ap-hero-copy">
          <div className="ap-hero-badge">Solution restaurant · QR code · Temps réel</div>
          <h1 id="ap-hero-h1" className="ap-hero-title">
            <span className="ap-hero-line ap-hero-line--1">Scannez.</span>
            <span className="ap-hero-line ap-hero-line--2">Commandez.</span>
            <span className="ap-hero-line ap-hero-line--3">On s&apos;occupe du reste.</span>
          </h1>
          <p className="ap-hero-lead">
            La solution de commande à table pensée pour les restaurants.<br />
            Simple, instantanée, sans friction.
          </p>
          <div className="ap-hero-cta">
            <Link href="/dashboard/auth" className="ap-btn ap-btn--filled ap-btn--lg">
              Accès équipe
            </Link>
            <a href="#demo" className="ap-btn ap-btn--ghost ap-btn--lg">
              Voir la démo
            </a>
          </div>
        </div>
        <div className="ap-hero-device" aria-hidden="true">
          <div className="ap-hero-device-glow" />
          <LandingPhoneMock />
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="ap-stats" aria-label="Chiffres clés">
        <div className="ap-stats-inner">
          {STATS.map((s, i) => (
            <div key={i} className="ap-stat ap-reveal">
              <span className="ap-stat-value">{s.value}</span>
              <span className="ap-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Showcase ── */}
      <section id="demo" className="ap-showcase" aria-labelledby="ap-showcase-h2">
        <div className="ap-showcase-inner">
          <p className="ap-eyebrow ap-reveal">Démo produit</p>
          <h2 id="ap-showcase-h2" className="ap-sr-only">Fonctionnement de Qrder</h2>
          <div className="ap-showcase-grid">
            <ol className="ap-steps ap-reveal">
              {STEPS.map((s) => (
                <li key={s.kicker} className="ap-step">
                  <span className="ap-step-kicker">{s.kicker}</span>
                  <h3 className="ap-step-title">{s.title}</h3>
                  <p className="ap-step-body">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="ap-showcase-device ap-reveal">
              <div className="ap-device-ambient" aria-hidden="true" />
              <LandingPhoneMock />
            </div>
          </div>
        </div>
      </section>

      {/* ── Values ── */}
      <section id="resultats" className="ap-values" aria-labelledby="ap-values-h2">
        <div className="ap-values-inner">
          <p className="ap-eyebrow ap-reveal">Pourquoi Qrder</p>
          <h2 id="ap-values-h2" className="ap-section-title ap-reveal">
            Moins d&apos;attente.<br />Plus de ventes.
          </h2>
          <p className="ap-section-lead ap-reveal">
            Tout ce dont votre restaurant a besoin pour servir plus vite et mieux.
          </p>
          <ul className="ap-value-grid">
            {VALUES.map((v, i) => (
              <li key={i} className={`ap-value-card ap-reveal ap-reveal--d${i + 1}`}>
                <span className="ap-value-num">{v.num}</span>
                <strong className="ap-value-title">{v.title}</strong>
                <p className="ap-value-body">{v.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="ap-cta-banner" aria-label="Appel à l'action">
        <div className="ap-cta-glow" aria-hidden="true" />
        <div className="ap-cta-inner">
          <h2 className="ap-cta-title ap-reveal">
            Prêt à transformer<br />votre service ?
          </h2>
          <p className="ap-cta-lead ap-reveal">
            Configurez votre restaurant en moins de 5 minutes.
          </p>
          <Link
            href="/dashboard/auth"
            className="ap-btn ap-btn--filled ap-btn--lg ap-reveal"
          >
            Commencer maintenant
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="ap-footer">
        <div className="ap-footer-inner">
          <QrderLogo className="ap-footer-logo" />
          <nav className="ap-footer-nav" aria-label="Pied de page">
            <a href="#offre">Fonctionnement</a>
            <a href="#demo">Démo</a>
            <a href="#resultats">Résultats</a>
            <Link href="/dashboard/auth">Connexion</Link>
          </nav>
          <p className="ap-footer-copy">© {new Date().getFullYear()} Qrder</p>
        </div>
      </footer>
    </main>
  );
}
