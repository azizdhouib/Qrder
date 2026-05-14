"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  X,
  QrCode,
  Smartphone,
  ChefHat,
  BarChart3,
  Zap,
  ShieldCheck,
  TrendingUp,
  Users,
  ArrowRight,
} from "lucide-react";
import { QrderLogo } from "@/components/QrderLogo";

/* ─────────────────────────────────────────────
   Slides config
───────────────────────────────────────────── */
const SLIDES = [
  "intro",
  "problem",
  "solution",
  "client",
  "kitchen",
  "dashboard",
  "results",
  "cta",
] as const;
type SlideId = (typeof SLIDES)[number];

/* Per-slide ambient color — drives the background glow */
const SLIDE_HUE: Record<SlideId, string> = {
  intro:     "264",
  problem:   "10",
  solution:  "220",
  client:    "168",
  kitchen:   "38",
  dashboard: "248",
  results:   "155",
  cta:       "264",
};

const TRANSITION_MS = 700;

/* ─────────────────────────────────────────────
   Root
───────────────────────────────────────────── */
export default function DemoPresentation() {
  const [current, setCurrent]     = useState(0);
  const [exiting, setExiting]     = useState<number | null>(null);
  const [entering, setEntering]   = useState<number | null>(null);
  const [busy, setBusy]           = useState(false);
  const [dir, setDir]             = useState<"next" | "prev">("next");
  const [hintGone, setHintGone]   = useState(false);
  const transTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchX     = useRef<number | null>(null);

  const dismissHint = useCallback(() => setHintGone(true), []);

  /* Auto-dismiss hint */
  useEffect(() => {
    const t = setTimeout(() => setHintGone(true), 4200);
    return () => clearTimeout(t);
  }, []);

  const go = useCallback(
    (nextI: number, direction: "next" | "prev") => {
      if (busy) return;
      if (nextI < 0 || nextI >= SLIDES.length) return;
      dismissHint();

      setDir(direction);
      setExiting(current);
      setEntering(nextI);
      setBusy(true);

      if (transTimer.current) clearTimeout(transTimer.current);
      transTimer.current = setTimeout(() => {
        setCurrent(nextI);
        setExiting(null);
        setEntering(null);
        setBusy(false);
      }, TRANSITION_MS);
    },
    [busy, current, dismissHint]
  );

  const next = useCallback(() => go(current + 1, "next"), [go, current]);
  const prev = useCallback(() => go(current - 1, "prev"), [go, current]);

  /* Keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft")                   { e.preventDefault(); prev(); }
      if (e.key === "Escape")                       window.history.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  /* Swipe */
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -44) next();
    if (dx >  44) prev();
    touchX.current = null;
  };

  const progress = ((current + 1) / SLIDES.length) * 100;
  const hue      = SLIDE_HUE[SLIDES[exiting ?? current]];
  const hueNext  = entering !== null ? SLIDE_HUE[SLIDES[entering]] : hue;

  return (
    <div
      className="dp-root"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      /* CSS custom props drive the ambient glow color */
      style={{
        "--dp-hue":      hue,
        "--dp-hue-next": hueNext,
      } as React.CSSProperties}
    >
      {/* Layered background */}
      <div className="dp-bg" aria-hidden>
        <div className="dp-bg-layer dp-bg-layer--base" />
        <div className={`dp-bg-layer dp-bg-layer--glow${busy ? " dp-bg-layer--transitioning" : ""}`} />
        <div className="dp-bg-noise" />
      </div>

      {/* Progress bar */}
      <div className="dp-progress" aria-hidden>
        <div className="dp-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Topbar */}
      <header className="dp-topbar">
        <Link href="/" aria-label="Quitter la démo" className="dp-topbar-home">
          <QrderLogo className="dp-topbar-lockup" />
        </Link>
        <nav className="dp-topbar-center" aria-label="Navigation slides">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i, i > current ? "next" : "prev")}
              className={`dp-step-dot${i === current ? " dp-step-dot--active" : i < current ? " dp-step-dot--done" : ""}`}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === current ? "step" : undefined}
            />
          ))}
        </nav>
        <div className="dp-topbar-right">
          <span className="dp-counter" aria-live="polite" aria-atomic>
            <span className="dp-counter-cur">{current + 1}</span>
            <span className="dp-counter-sep">/</span>
            <span className="dp-counter-tot">{SLIDES.length}</span>
          </span>
          <Link href="/" className="dp-close-btn" aria-label="Fermer">
            <X size={15} strokeWidth={2.5} />
          </Link>
        </div>
      </header>

      {/* ── Slide viewport (dual-layer during transition) ── */}
      <div className="dp-viewport">
        {/* Exiting slide */}
        {busy && exiting !== null && (
          <div
            key={`exit-${exiting}`}
            className={`dp-layer dp-layer--exit dp-exit-${dir}`}
            aria-hidden
          >
            <SlideRenderer id={SLIDES[exiting]}  />
          </div>
        )}

        {/* Entering / idle slide */}
        <div
          key={`s-${busy && entering !== null ? entering : current}`}
          className={`dp-layer${busy ? ` dp-layer--enter dp-enter-${dir}` : " dp-layer--idle"}`}
          aria-live="polite"
          aria-atomic
        >
          <SlideRenderer id={SLIDES[busy && entering !== null ? entering : current]} />
        </div>
      </div>

      {/* Bottom navigation */}
      <footer className="dp-nav">
        <button
          type="button"
          className="dp-nav-arrow dp-nav-arrow--prev"
          onClick={prev}
          disabled={current === 0 || busy}
          aria-label="Slide précédente"
        >
          <ChevronLeft size={17} strokeWidth={2.5} />
        </button>

        <div className="dp-nav-center">
          {current > 0 && (
            <button type="button" className="dp-nav-label-btn" onClick={prev}>
              {slideLabel(SLIDES[current - 1])}
            </button>
          )}
          <span className="dp-nav-current-label">{slideLabel(SLIDES[current])}</span>
          {current < SLIDES.length - 1 && (
            <button type="button" className="dp-nav-label-btn" onClick={next}>
              {slideLabel(SLIDES[current + 1])}
            </button>
          )}
        </div>

        <button
          type="button"
          className="dp-nav-arrow dp-nav-arrow--next"
          onClick={next}
          disabled={current === SLIDES.length - 1 || busy}
          aria-label="Slide suivante"
        >
          <ChevronRight size={17} strokeWidth={2.5} />
        </button>
      </footer>

      {/* Keyboard hint */}
      <p className={`dp-hint${hintGone ? " dp-hint--gone" : ""}`} aria-hidden>
        Flèches pour naviguer &nbsp;·&nbsp; Esc pour quitter
      </p>
    </div>
  );
}

function slideLabel(id: SlideId): string {
  const map: Record<SlideId, string> = {
    intro:     "Introduction",
    problem:   "Le problème",
    solution:  "La solution",
    client:    "Côté client",
    kitchen:   "Côté cuisine",
    dashboard: "Dashboard",
    results:   "Résultats",
    cta:       "Commencer",
  };
  return map[id];
}

/* ─────────────────────────────────────────────
   Slide renderer
───────────────────────────────────────────── */
function SlideRenderer({ id }: { id: SlideId }) {
  switch (id) {
    case "intro":     return <SlideIntro />;
    case "problem":   return <SlideProblem />;
    case "solution":  return <SlideSolution />;
    case "client":    return <SlideClient />;
    case "kitchen":   return <SlideKitchen />;
    case "dashboard": return <SlideDashboard />;
    case "results":   return <SlideResults />;
    case "cta":       return <SlideCta />;
  }
}

/* ─────────────────────────────────────────────
   SLIDE 1 — Intro
───────────────────────────────────────────── */
function SlideIntro() {
  return (
    <div className="dp-slide dp-slide--center">
      <div className="dp-slide-inner">
        <QrderLogo className="dp-intro-lockup" />
        <h1 className="dp-display">
          La commande à table<br />
          <em className="dp-display-em">réinventée.</em>
        </h1>
        <p className="dp-lead">
          QR code · Menu mobile · Cuisine en temps réel · Analytics
        </p>
        <div className="dp-badge-row">
          <span className="dp-badge">Aucune app à télécharger</span>
          <span className="dp-badge">Prêt en 5 minutes</span>
          <span className="dp-badge">100 % web</span>
        </div>
        <p className="dp-intro-hint">Appuyez sur → pour commencer</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 2 — Problème
───────────────────────────────────────────── */
const PROBLEMS = [
  { emoji: "😤", title: "Serveurs épuisés", body: "Prendre les commandes à la main ralentit le service et démotive les équipes." },
  { emoji: "❌", title: "Erreurs récurrentes", body: "Un plat mal entendu, une allergie oubliée — ça coûte cher en retours cuisine." },
  { emoji: "⏳", title: "Clients impatients", body: "Plus d'attente = moins de rotation, moins de chiffre d'affaires." },
] as const;

function SlideProblem() {
  return (
    <div className="dp-slide">
      <div className="dp-slide-inner dp-slide-inner--wide">
        <p className="dp-eyebrow">Le problème</p>
        <h2 className="dp-title">
          Les restaurants perdent du temps<br />et de l&apos;argent chaque jour.
        </h2>
        <div className="dp-card-row">
          {PROBLEMS.map((p, i) => (
            <div key={p.title} className="dp-problem-card">
              <span className="dp-problem-emoji" aria-hidden>{p.emoji}</span>
              <strong className="dp-problem-title">{p.title}</strong>
              <p className="dp-problem-body">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 3 — Solution
───────────────────────────────────────────── */
const FLOW_STEPS = [
  { Icon: QrCode,     num: "01", label: "Le client scanne le QR code posé sur la table" },
  { Icon: Smartphone, num: "02", label: "Il parcourt le menu et valide sa commande" },
  { Icon: ChefHat,    num: "03", label: "La commande apparaît instantanément en cuisine" },
] as const;

function SlideSolution() {
  return (
    <div className="dp-slide dp-slide--center">
      <div className="dp-slide-inner">
        <p className="dp-eyebrow">La solution</p>
        <h2 className="dp-title">Trois étapes. Zéro friction.</h2>
        <div className="dp-flow">
          {FLOW_STEPS.map(({ Icon, num, label }, i) => (
            <div key={num} className="dp-flow-item">
              <div className="dp-flow-icon">
                <Icon size={24} strokeWidth={1.6} aria-hidden />
              </div>
              <span className="dp-flow-num">{num}</span>
              <p className="dp-flow-label">{label}</p>
              {i < FLOW_STEPS.length - 1 && (
                <ArrowRight className="dp-flow-connector" size={18} strokeWidth={1.5} aria-hidden />
              )}
            </div>
          ))}
        </div>
        <p className="dp-subnote">Fonctionne sur tous les smartphones, sans installation.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 4 — Client (menu mobile)
───────────────────────────────────────────── */
function SlideClient() {
  return (
    <div className="dp-slide dp-slide--split">
      <div className="dp-split-copy">
        <p className="dp-eyebrow">Côté client</p>
        <h2 className="dp-title dp-title--left">
          Un menu beau,<br />rapide, sur mesure.
        </h2>
        <ul className="dp-feats">
          <li><Zap size={15} aria-hidden /><span>Ouverture instantanée via QR code</span></li>
          <li><Smartphone size={15} aria-hidden /><span>Interface mobile, mode sombre / clair</span></li>
          <li><ShieldCheck size={15} aria-hidden /><span>Catégories, allergènes, badges maison</span></li>
          <li><QrCode size={15} aria-hidden /><span>Un QR par table, reconnu automatiquement</span></li>
        </ul>
      </div>
      <div className="dp-split-visual">
        <PhoneMock />
      </div>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="dp-phone">
      <div className="dp-phone-notch" aria-hidden />
      <div className="dp-phone-screen">
        <div className="dp-menu-mock">
          <div className="dp-menu-header">
            <span className="dp-menu-table">TABLE M4</span>
            <span className="dp-menu-name">Brasserie L&apos;Orée</span>
            <p className="dp-menu-tag">Commandez en quelques gestes.</p>
          </div>
          <div className="dp-menu-tabs">
            <span className="dp-menu-tab dp-menu-tab--on">Entrées</span>
            <span className="dp-menu-tab">Plats</span>
            <span className="dp-menu-tab">Desserts</span>
          </div>
          {[
            { name: "Salade des halles",   price: "9,20 €", desc: "Mesclun, Comté, miel-moutarde" },
            { name: "Velouté de panais",   price: "8,90 €", desc: "Croûtons, huile de noisette" },
            { name: "Tartine chèvre-miel", price: "10,50 €", desc: "Levain, romarin, fleur de sel" },
          ].map((d) => (
            <div key={d.name} className="dp-dish">
              <div className="dp-dish-info">
                <span className="dp-dish-name">{d.name}</span>
                <span className="dp-dish-desc">{d.desc}</span>
              </div>
              <div className="dp-dish-right">
                <span className="dp-dish-price">{d.price}</span>
                <span className="dp-dish-add" aria-hidden>+</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="dp-phone-bar" aria-hidden />
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 5 — Cuisine (KDS)
───────────────────────────────────────────── */
const KDS_TICKETS = [
  { table: "T1", items: ["Salade des halles ×1", "Velouté ×2"],    elapsed: "2 min", status: "prep"  },
  { table: "T3", items: ["Tartine chèvre ×1",   "Plat du jour ×3"], elapsed: "5 min", status: "new"   },
  { table: "M2", items: ["Burger maison ×2"],                        elapsed: "8 min", status: "ready" },
] as const;

function SlideKitchen() {
  return (
    <div className="dp-slide dp-slide--split dp-slide--split-rev">
      <div className="dp-split-visual">
        <div className="dp-kds">
          <div className="dp-kds-header">
            <ChefHat size={14} strokeWidth={1.75} aria-hidden />
            <span>Écran cuisine — KDS</span>
            <span className="dp-kds-live">● Live</span>
          </div>
          <div className="dp-kds-grid">
            {KDS_TICKETS.map((t) => (
              <div key={t.table} className={`dp-ticket dp-ticket--${t.status}`}>
                <div className="dp-ticket-top">
                  <strong>{t.table}</strong>
                  <span className="dp-ticket-time">{t.elapsed}</span>
                </div>
                <ul className="dp-ticket-items">
                  {t.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
                <div className="dp-ticket-bar" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="dp-split-copy">
        <p className="dp-eyebrow">Côté cuisine</p>
        <h2 className="dp-title dp-title--left">
          Des commandes nettes,<br />en temps réel.
        </h2>
        <ul className="dp-feats">
          <li><Zap size={15} aria-hidden /><span>Affichage instantané dès validation client</span></li>
          <li><ChefHat size={15} aria-hidden /><span>Interface tablette, optimisée cuisine</span></li>
          <li><ShieldCheck size={15} aria-hidden /><span>Table, horodatage, statut en un regard</span></li>
          <li><TrendingUp size={15} aria-hidden /><span>Moins de va-et-vient, zéro incompréhension</span></li>
        </ul>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 6 — Dashboard
───────────────────────────────────────────── */
function SlideDashboard() {
  return (
    <div className="dp-slide dp-slide--split">
      <div className="dp-split-copy">
        <p className="dp-eyebrow">Côté gérant</p>
        <h2 className="dp-title dp-title--left">
          Piloter, analyser,<br />décider.
        </h2>
        <ul className="dp-feats">
          <li><BarChart3 size={15} aria-hidden /><span>CA, commandes, panier moyen, taux de service</span></li>
          <li><TrendingUp size={15} aria-hidden /><span>Top articles par jour, semaine ou mois</span></li>
          <li><Users size={15} aria-hidden /><span>Tables actives et flux des commandes en direct</span></li>
          <li><ShieldCheck size={15} aria-hidden /><span>Export comptable, facturation, historique</span></li>
        </ul>
      </div>
      <div className="dp-split-visual">
        <div className="dp-dash">
          <div className="dp-dash-kpis">
            {[
              { v: "2 840 €", l: "Chiffre d'affaires" },
              { v: "47",      l: "Commandes" },
              { v: "89 %",    l: "Taux de service" },
              { v: "12",      l: "Tables actives" },
            ].map((k) => (
              <div key={k.l} className="dp-dash-kpi">
                <span className="dp-dash-kpi-v">{k.v}</span>
                <span className="dp-dash-kpi-l">{k.l}</span>
              </div>
            ))}
          </div>
          <div className="dp-dash-panels">
            <div className="dp-dash-panel">
              <p className="dp-dash-panel-t">Top articles</p>
              {[
                { n: "Salade des halles", q: 18, w: 100 },
                { n: "Burger maison",     q: 14, w: 78  },
                { n: "Velouté de panais", q: 11, w: 61  },
              ].map((it) => (
                <div key={it.n} className="dp-dash-row">
                  <span className="dp-dash-row-name">{it.n}</span>
                  <span className="dp-dash-row-qty">{it.q}×</span>
                  <div className="dp-dash-bar"><div style={{ width: `${it.w}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="dp-dash-panel">
              <p className="dp-dash-panel-t">Flux commandes</p>
              {[
                { l: "Servi",     c: 42, pct: 89, col: "#6366f1" },
                { l: "En prépa",  c:  4, pct:  8, col: "#3b82f6" },
                { l: "Annulé",    c:  1, pct:  3, col: "#ef4444" },
              ].map((s) => (
                <div key={s.l} className="dp-dash-status">
                  <span className="dp-dash-dot" style={{ background: s.col }} />
                  <span className="dp-dash-status-l">{s.l}</span>
                  <span className="dp-dash-status-c">{s.c}</span>
                  <div className="dp-dash-bar">
                    <div style={{ width: `${s.pct}%`, background: s.col, opacity: 0.7 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 7 — Résultats
───────────────────────────────────────────── */
const RESULTS = [
  { num: "−80 %", label: "d'erreurs de commande",  color: "#6366f1" },
  { num: "+35 %", label: "de panier moyen",         color: "#10b981" },
  { num: "2×",    label: "plus de tables servies",  color: "#f59e0b" },
  { num: "0",     label: "app à télécharger",       color: "#3b82f6" },
] as const;

function SlideResults() {
  return (
    <div className="dp-slide dp-slide--center">
      <div className="dp-slide-inner">
        <p className="dp-eyebrow">Résultats mesurés</p>
        <h2 className="dp-title">Des chiffres qui parlent.</h2>
        <div className="dp-results">
          {RESULTS.map((r, i) => (
            <div key={r.label} className="dp-result-card">
              <span className="dp-result-num" style={{ color: r.color }}>{r.num}</span>
              <span className="dp-result-label">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SLIDE 8 — CTA
───────────────────────────────────────────── */
function SlideCta() {
  return (
    <div className="dp-slide dp-slide--center">
      <div className="dp-slide-inner">
        <p className="dp-eyebrow">Commencer</p>
        <h2 className="dp-display">
          Prêt à transformer<br />
          <em className="dp-display-em">votre service ?</em>
        </h2>
        <p className="dp-lead">
          Configuration complète en moins de 5 minutes.<br />
          Tables, menu, QR codes — tout est prêt.
        </p>
        <div className="dp-cta-row">
          <Link href="/dashboard/auth" className="dp-cta-primary">
            Accéder à l&apos;espace équipe
            <ArrowRight size={17} strokeWidth={2.25} aria-hidden />
          </Link>
          <Link href="/" className="dp-cta-ghost">Retour à l&apos;accueil</Link>
        </div>
      </div>
    </div>
  );
}
