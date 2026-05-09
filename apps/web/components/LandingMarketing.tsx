"use client";

import Link from "next/link";
import {
  Clock,
  QrCode,
  Shield,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LandingPhoneMock } from "@/components/LandingPhoneMock";
import { QrderLogo } from "@/components/QrderLogo";

const FEATURE_PILLS = [
  { icon: QrCode, text: "Scan du QR code par le client" },
  { icon: Zap, text: "Commande instantanée" },
  { icon: UtensilsCrossed, text: "Reçue directement en cuisine" },
  { icon: TrendingUp, text: "Plus de ventes, moins d'attente" }
] as const;

const CINE_STEPS = [
  {
    kicker: "01 — À table",
    title: "Un QR, tout le menu.",
    body: "Vos clients scannent, parcourent les catégories et ajoutent au panier sans friction."
  },
  {
    kicker: "02 — En cuisine",
    title: "Les commandes arrivent nettes.",
    body: "Chaque ticket arrive structuré : table, horodatage, détails des plats — moins de va-et-vient."
  },
  {
    kicker: "03 — En salle",
    title: "Le service respire.",
    body: "Moins d'erreurs d'écoute, plus de temps pour l'accueil et le dressage."
  }
] as const;

export default function LandingMarketing() {
  const heroRef = useRef<HTMLElement>(null);
  const scrollRaf = useRef<number>(0);
  const [navDense, setNavDense] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const onScroll = useCallback(() => {
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const vh = window.innerHeight;
      const y = window.scrollY;

      setNavDense((prev) => {
        const next = y > 24;
        return prev === next ? prev : next;
      });

      const hero = heroRef.current;
      let hp = 0;
      if (hero) {
        const bottom = hero.getBoundingClientRect().bottom;
        hp = Math.max(0, Math.min(1, 1 - bottom / (vh * 0.92)));
      }
      if (reduceMotion) hp = 0;
      hero?.style.setProperty("--hero-scroll", String(hp));
    });
  }, [reduceMotion]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const mqListener = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", mqListener);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
      mq.removeEventListener("change", mqListener);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [onScroll]);

  return (
    <main className={`landing-marketing ${reduceMotion ? "landing-marketing--reduced-motion" : ""}`}>
      <header className={`landing-nav ${navDense ? "landing-nav--dense" : ""}`}>
        <div className="landing-nav-inner container landing-container">
          <Link href="/" className="landing-logo landing-logo--img" aria-label="Qrder — Accueil">
            <QrderLogo className="landing-logo-image" />
          </Link>
          <nav className="landing-nav-links" aria-label="Navigation marketing">
            <a href="#offre">Offre</a>
            <a href="#demo">Démo</a>
            <a href="#resultats">Résultats</a>
          </nav>
          <Link href="/dashboard/auth" className="landing-btn landing-btn-nav">
            Espace équipe
          </Link>
        </div>
      </header>

      <section
        ref={heroRef}
        className="landing-cine-hero"
        aria-labelledby="landing-hero-heading"
        id="offre"
      >
        <div className="landing-cine-hero-bg" aria-hidden="true" />
        <div className="landing-cine-hero-vignette" aria-hidden="true" />
        <div className="container landing-container landing-cine-hero-inner">
          <div className="landing-cine-hero-copy">
            <h1 id="landing-hero-heading" className="landing-cine-hero-title">
              <span className="landing-cine-line landing-cine-line--1">Scannez.</span>
              <span className="landing-cine-line landing-cine-line--2">Commandez.</span>
              <span className="landing-cine-line landing-cine-line--3">On s&apos;occupe du reste.</span>
            </h1>
            <p className="landing-cine-hero-lead">
              La solution de commande à table simple, rapide et pensée pour les restaurants.
            </p>
            <ul className="landing-cine-pills">
              {FEATURE_PILLS.map(({ icon: Icon, text }) => (
                <li key={text}>
                  <Icon className="landing-cine-pill-icon" strokeWidth={1.75} aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <div className="landing-cine-hero-cta">
              <Link href="/dashboard/auth" className="landing-btn landing-btn-primary landing-cine-cta-primary">
                Accès équipe
              </Link>
              <a href="#demo" className="landing-link-discover landing-cine-cta-secondary">
                Voir la démo
                <span className="landing-arrow" aria-hidden="true">
                  ↓
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="demo" className="landing-cine-showcase" aria-labelledby="landing-demo-heading">
        <div className="container landing-container">
          <h2 id="landing-demo-heading" className="landing-cine-showcase-heading landing-sr-only">
            Démo — parcours produit
          </h2>
          <div className="landing-cine-showcase-grid">
            <ol className="landing-cine-steps-list">
              {CINE_STEPS.map((step) => (
                <li key={step.kicker} className="landing-cine-step">
                  <p className="landing-cine-step-kicker">{step.kicker}</p>
                  <h3 className="landing-cine-step-title">{step.title}</h3>
                  <p className="landing-cine-step-body">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="landing-cine-device">
              <div className="landing-cine-device-glow" aria-hidden="true" />
              <div className="landing-cine-device-frame landing-phone-showcase">
                <LandingPhoneMock />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="resultats" className="landing-values-slab" aria-labelledby="landing-values-heading">
        <div className="container landing-container">
          <h2 id="landing-values-heading" className="landing-values-slab-title landing-cine-vreveal">
            Pourquoi Qrder
          </h2>
          <ul className="landing-value-grid">
            <li className="landing-cine-vreveal landing-cine-vreveal--d1">
              <Clock className="landing-value-icon" strokeWidth={1.5} aria-hidden />
              <strong>Moins d&apos;attente.</strong>
              <span>Plus de clients servis.</span>
            </li>
            <li className="landing-cine-vreveal landing-cine-vreveal--d2">
              <Shield className="landing-value-icon" strokeWidth={1.5} aria-hidden />
              <strong>Moins d&apos;erreurs.</strong>
              <span>Les clients commandent, vous validez.</span>
            </li>
            <li className="landing-cine-vreveal landing-cine-vreveal--d3">
              <Users className="landing-value-icon" strokeWidth={1.5} aria-hidden />
              <strong>Moins de pression en salle.</strong>
              <span>Vos équipes se concentrent sur l&apos;essentiel.</span>
            </li>
            <li className="landing-cine-vreveal landing-cine-vreveal--d4">
              <TrendingUp className="landing-value-icon" strokeWidth={1.5} aria-hidden />
              <strong>Plus de chiffre d&apos;affaires.</strong>
              <span>Plus de commandes, panier moyen plus élevé.</span>
            </li>
          </ul>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="container landing-container landing-footer-inner">
          <QrderLogo className="landing-footer-logo" />
          <Link href="/dashboard/auth" className="landing-footer-link">
            Connexion équipe
          </Link>
        </div>
      </footer>
    </main>
  );
}
