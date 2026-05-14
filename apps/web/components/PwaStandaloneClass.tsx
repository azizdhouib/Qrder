"use client";

import { useEffect } from "react";

/** Applique une classe racine en mode standalone / TWA pour styles tactiles plein écran. */
export function PwaStandaloneClass() {
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const ios =
      typeof navigator !== "undefined" &&
      "standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const apply = () => {
      if (mq.matches || ios) document.documentElement.classList.add("pwa-standalone");
      else document.documentElement.classList.remove("pwa-standalone");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}
