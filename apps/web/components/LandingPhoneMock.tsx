"use client";

import { useState } from "react";

const LANDING_MENU_LEAF_D =
  "M9.95 2.05C8.8 1.9 7.25 2.55 6.1 3.7 4.6 5.2 4.05 7.15 4.8 7.9c.75.75 2.7.2 4.2-1.3 1.15-1.15 1.8-2.7 1.65-3.85a2.35 2.35 0 00-.7-1.7zM3.3 8.1c-.45-.45-.7-1.7.55-3.5L2.85 5.6C1.8 7.35 1.65 8.5 2.5 9.35c.75.75 2.05.55 3.55-.1l-.55-.55c-1 .3-1.8.2-2.2-.15z";

function LandingPhoneMenuLeafIcon() {
  return (
    <svg
      className="landing-phone-dish-leaf"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path fill="currentColor" d={LANDING_MENU_LEAF_D} />
    </svg>
  );
}

function LandingPhoneMenuDemo({ variant }: { variant: "dark" | "light" }) {
  const rootClass =
    variant === "dark"
      ? "landing-phone-menu landing-phone-menu--dark"
      : "landing-phone-menu landing-phone-menu--light";

  return (
    <div className={rootClass}>
      <header className="landing-phone-menu-hero">
        <span className="landing-phone-menu-table">TABLE M4</span>
        <span className="landing-phone-menu-restaurant">Brasserie L&apos;Orée</span>
        <p className="landing-phone-menu-tagline">
          Commandez depuis la table, en quelques gestes.
        </p>
      </header>
      <div className="landing-phone-menu-cats-bar">
        <div className="landing-phone-menu-cats">
          <span className="landing-phone-menu-cat landing-phone-menu-cat--active">
            Hors-d&apos;œuvre
          </span>
          <span className="landing-phone-menu-cat">Plats du four</span>
          <span className="landing-phone-menu-cat">Bouchées salées</span>
          <span className="landing-phone-menu-cat">Douceurs</span>
        </div>
      </div>
      <h2 className="landing-phone-menu-heading">Hors-d&apos;œuvre</h2>
      <ul className="landing-phone-menu-list">
        <li className="landing-phone-dish">
          <div className="landing-phone-dish-main">
            <div className="landing-phone-dish-title-row">
              <span className="landing-phone-dish-name">Salade des halles</span>
              <span className="landing-phone-dish-price">9,20 €</span>
            </div>
            <p className="landing-phone-dish-desc">
              Mesclun, radis noir, copeaux de Comté, vinaigrette miel-moutarde.
            </p>
            <span className="landing-phone-dish-badge">
              <LandingPhoneMenuLeafIcon />
              Maison
            </span>
          </div>
          <span className="landing-phone-dish-add">+</span>
        </li>
        <li className="landing-phone-dish">
          <div className="landing-phone-dish-main">
            <div className="landing-phone-dish-title-row">
              <span className="landing-phone-dish-name">Velouté de panais</span>
              <span className="landing-phone-dish-price">8,90 €</span>
            </div>
            <p className="landing-phone-dish-desc">
              Croûtons croustillants, huile de noisette toastée, poivre timut.
            </p>
            <span className="landing-phone-dish-badge">
              <LandingPhoneMenuLeafIcon />
              Maison
            </span>
          </div>
          <span className="landing-phone-dish-add">+</span>
        </li>
        <li className="landing-phone-dish">
          <div className="landing-phone-dish-main">
            <div className="landing-phone-dish-title-row">
              <span className="landing-phone-dish-name">Tartinade chèvre-miel</span>
              <span className="landing-phone-dish-price">10,50 €</span>
            </div>
            <p className="landing-phone-dish-desc">
              Pain au levain grillé, romarin frais, fleur de sel.
            </p>
            <span className="landing-phone-dish-badge">
              <LandingPhoneMenuLeafIcon />
              Maison
            </span>
          </div>
          <span className="landing-phone-dish-add">+</span>
        </li>
      </ul>
    </div>
  );
}

/** Maquette iPhone marketing : menu démo avec bascule clair / sombre (sans scroll interne). */
export function LandingPhoneMock() {
  const [menuTheme, setMenuTheme] = useState<"dark" | "light">("dark");

  return (
    <div className="landing-phone">
      <div className="landing-phone-glow" aria-hidden="true" />
      <div className="landing-phone-chassis">
        <div className="landing-phone-shell">
          <div className="landing-phone-glare" aria-hidden="true" />
          <div className="landing-phone-display">
            <div className="landing-phone-status" aria-hidden="true">
              <span className="landing-phone-time">9:41</span>
              <span className="landing-phone-island-slot">
                <span className="landing-phone-island" />
              </span>
              <span className="landing-phone-indicators">
                <span className="landing-phone-signal">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                <svg
                  className="landing-phone-wifi-icon"
                  width="15"
                  height="11"
                  viewBox="0 0 15 11"
                  aria-hidden="true"
                >
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    d="M1.8 4.2a6.6 6.6 0 019.4 0M4.1 6.5a3.5 3.5 0 114.8 0"
                  />
                  <circle cx="7.5" cy="9.2" r="1" fill="currentColor" />
                </svg>
                <span className="landing-phone-battery" aria-hidden="true">
                  <span className="landing-phone-battery-level" />
                </span>
              </span>
            </div>
            <div
              className={
                menuTheme === "light"
                  ? "landing-phone-app landing-phone-app--menu-light"
                  : "landing-phone-app landing-phone-app--menu-dark"
              }
            >
              <div className="landing-phone-app-scroll">
                <LandingPhoneMenuDemo variant={menuTheme} />
              </div>
              <button
                type="button"
                className="landing-phone-fab"
                onClick={() => setMenuTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label={
                  menuTheme === "dark"
                    ? "Passer le menu démo en thème clair"
                    : "Passer le menu démo en thème sombre"
                }
              >
                {menuTheme === "dark" ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                    <path
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      d="M12 2v2M12 20v2M2 12h2M20 12h2"
                    />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            <div className="landing-phone-home-indicator" aria-hidden="true" />
          </div>
        </div>
        <div className="landing-phone-rail landing-phone-rail--left" aria-hidden="true">
          <span className="landing-phone-key landing-phone-key--mute" />
          <span className="landing-phone-key landing-phone-key--vol-up" />
          <span className="landing-phone-key landing-phone-key--vol-down" />
        </div>
        <div className="landing-phone-rail landing-phone-rail--right" aria-hidden="true">
          <span className="landing-phone-key landing-phone-key--power" />
        </div>
      </div>
    </div>
  );
}
