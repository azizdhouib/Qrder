import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Qrder — Le service, simplifié.",
  description:
    "Commande par QR code pour restaurants : vos clients scannent, commandent, la cuisine reçoit en temps réel. Sans application."
};

export default function HomePage() {
  return (
    <main className="landing-marketing">
      <header className="landing-nav">
        <div className="landing-nav-inner container landing-container">
          <Link href="/" className="landing-logo">
            <span className="landing-logo-mark" aria-hidden="true" />
            <span className="landing-logo-text">Qrder</span>
          </Link>
          <nav className="landing-nav-links" aria-label="Navigation marketing">
            <a href="#fonctionnement">Fonctionnement</a>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#resultats">Résultats</a>
          </nav>
          <Link href="/dashboard/auth" className="landing-btn landing-btn-nav">
            Espace équipe
          </Link>
        </div>
      </header>

      <section className="landing-hero container landing-container">
        <p className="landing-badge">Nouveau · 2026</p>
        <h1 className="landing-hero-title">Le service, simplifié.</h1>
        <p className="landing-hero-sub">
          Vos clients scannent. Commandent. La cuisine reçoit, en temps réel. Pas d&apos;app, pas
          d&apos;attente, pas d&apos;erreur.
        </p>
        <div className="landing-hero-cta">
          <Link href="/dashboard/auth" className="landing-btn landing-btn-primary">
            Accès équipe
          </Link>
          <a href="#fonctionnement" className="landing-link-discover">
            Découvrir
            <span className="landing-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </section>

      <section id="fonctionnement" className="landing-section container landing-container">
        <h2 className="landing-section-title">Fonctionnement</h2>
        <p className="landing-section-lead">Trois gestes, une commande lancée.</p>
        <ol className="landing-steps">
          <li>
            <span className="landing-step-num">1</span>
            <div>
              <h3>Scan du QR</h3>
              <p>Chaque table a son QR : le menu s&apos;ouvre sur le téléphone du client, sans téléchargement.</p>
            </div>
          </li>
          <li>
            <span className="landing-step-num">2</span>
            <div>
              <h3>Panier &amp; envoi</h3>
              <p>Choix des plats, options, quantités. Un clic et la commande part en cuisine.</p>
            </div>
          </li>
          <li>
            <span className="landing-step-num">3</span>
            <div>
              <h3>Cuisine &amp; service</h3>
              <p>Statuts en direct, historique et pilotage pour adapter le service à votre rythme.</p>
            </div>
          </li>
        </ol>
      </section>

      <section id="fonctionnalites" className="landing-section container landing-container">
        <h2 className="landing-section-title">Fonctionnalités</h2>
        <p className="landing-section-lead">L&apos;essentiel pour votre salle et votre cuisine.</p>
        <ul className="landing-feature-grid">
          <li className="landing-feature-card">
            <h3>Menu &amp; prix</h3>
            <p>Catégories, plats, options et visuels — à jour en quelques clics.</p>
          </li>
          <li className="landing-feature-card">
            <h3>Tables &amp; QR</h3>
            <p>Générez un QR par table et gardez un accès client propre et identifiable.</p>
          </li>
          <li className="landing-feature-card">
            <h3>Cuisine live</h3>
            <p>Vue Kanban des commandes : attente, préparation, prêt, servi.</p>
          </li>
          <li className="landing-feature-card">
            <h3>Historique</h3>
            <p>Retrouvez chaque commande, les totaux et les statuts pour un suivi clair.</p>
          </li>
        </ul>
      </section>

      <section id="resultats" className="landing-section container landing-container landing-section-last">
        <h2 className="landing-section-title">Résultats</h2>
        <p className="landing-section-lead">Conçu pour fluidifier le service et libérer l&apos;équipe.</p>
        <ul className="landing-result-list">
          <li>
            <strong>Moins de va-et-vient</strong>
            <span>Prise de commande côté client, zéro fausse note sur l&apos;addition.</span>
          </li>
          <li>
            <strong>Image moderne</strong>
            <span>Une expérience fluide, calibrée mobile, digne des meilleures tables.</span>
          </li>
          <li>
            <strong>Pilotage simple</strong>
            <span>Vue d&apos;ensemble, cuisine et historique dans le même outil.</span>
          </li>
        </ul>
      </section>

      <div className="landing-phone-wrap container landing-container">
        <div className="landing-phone" aria-hidden="true">
          <div className="landing-phone-bezel">
            <div className="landing-phone-notch" />
            <div className="landing-phone-screen">
              <header className="landing-phone-header">
                <span className="landing-phone-brand">La Trattoria</span>
                <span className="landing-phone-menu-label">Menu</span>
              </header>
              <ul className="landing-phone-list">
                <li>
                  <div>
                    <span className="landing-phone-item-name">Burrata di Puglia</span>
                    <span className="landing-phone-item-desc">Tomates, basilic, huile d&apos;olive</span>
                  </div>
                  <span className="landing-phone-item-meta">
                    <span className="landing-phone-price">12,00 €</span>
                    <span className="landing-phone-plus">+</span>
                  </span>
                </li>
                <li>
                  <div>
                    <span className="landing-phone-item-name">Tagliatelles truffe</span>
                    <span className="landing-phone-item-desc">Crème, parmesan, truffe noire</span>
                  </div>
                  <span className="landing-phone-item-meta">
                    <span className="landing-phone-price">22,00 €</span>
                    <span className="landing-phone-plus">+</span>
                  </span>
                </li>
                <li>
                  <div>
                    <span className="landing-phone-item-name">Tiramisu maison</span>
                    <span className="landing-phone-item-desc">Café, mascarpone, cacao</span>
                  </div>
                  <span className="landing-phone-item-meta">
                    <span className="landing-phone-price">8,50 €</span>
                    <span className="landing-phone-plus">+</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="container landing-container landing-footer-inner">
          <span className="landing-footer-brand">Qrder</span>
          <Link href="/dashboard/auth" className="landing-footer-link">
            Connexion équipe
          </Link>
        </div>
      </footer>
    </main>
  );
}
