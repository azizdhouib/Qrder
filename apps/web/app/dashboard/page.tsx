export default function DashboardPage() {
  return (
    <main className="container stack">
      <section className="hero">
        <span className="badge">Dashboard</span>
        <h1 className="hero-title">Pilotage restaurant</h1>
        <p className="hero-subtitle">Un seul espace pour activer ton flux QR de bout en bout.</p>
      </section>

      <section className="grid grid-2">
        <a className="link-card" href="/dashboard/tables">
          <p className="section-title">Tables + QR</p>
          <p className="muted">Créer les tables, générer et télécharger les QR codes.</p>
        </a>
        <a className="link-card" href="/dashboard/menu">
          <p className="section-title">Gestion menu</p>
          <p className="muted">Configurer catégories, plats, prix et options.</p>
        </a>
        <a className="link-card" href="/dashboard/kitchen">
          <p className="section-title">Interface cuisine</p>
          <p className="muted">Recevoir les commandes en live et changer les statuts.</p>
        </a>
      </section>
    </main>
  );
}
