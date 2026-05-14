"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || Boolean(ios);
}

function installHintText(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
  if (iOS) {
    return "Safari : icône Partager, puis « Sur l’écran d’accueil ».";
  }
  return "Chrome / Edge : menu (⋮) → « Installer l’application » ou « Installer Qrder ». Sinon : menu du navigateur → ajouter à l’écran d’accueil.";
}

export function PwaInstallButton() {
  const hintRef = useRef<HTMLParagraphElement | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState<boolean | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    setStandalone(isStandalone());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || standalone !== false) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [standalone]);

  useEffect(() => {
    if (typeof window === "undefined" || standalone !== false) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onInstalled = () => {
      setDeferred(null);
      setJustInstalled(true);
      t = setTimeout(() => setJustInstalled(false), 12000);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, [standalone]);

  const install = useCallback(async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    } finally {
      setDeferred(null);
      setBusy(false);
    }
  }, [deferred]);

  if (standalone !== false) return null;

  const mainLabel = busy
    ? "Installation…"
    : justInstalled
      ? "Application installée"
      : deferred
        ? "Installer l’application"
        : "Ajouter à l’écran d’accueil";

  const onMainClick = () => {
    if (deferred) void install();
    else if (!justInstalled) hintRef.current?.focus({ preventScroll: false });
  };

  return (
    <div
      className={`pwa-install-bar${!deferred || justInstalled ? " pwa-install-bar--stack" : ""}`}
      role="region"
      aria-label="Installation application"
    >
      <button
        type="button"
        className="pwa-install-bar-main"
        disabled={busy || justInstalled}
        onClick={onMainClick}
        aria-describedby={!deferred && !justInstalled ? "pwa-install-hint" : undefined}
      >
        <Download size={17} strokeWidth={2} aria-hidden />
        <span>{mainLabel}</span>
      </button>
      {justInstalled ? (
        <p className="pwa-install-hint pwa-install-hint--success" id="pwa-install-hint-success">
          Ouvrez Qrder depuis l’icône sur votre écran d’accueil pour le mode plein écran.
        </p>
      ) : !deferred ? (
        <p
          ref={hintRef}
          id="pwa-install-hint"
          className="pwa-install-hint"
          tabIndex={-1}
        >
          {installHintText()}
        </p>
      ) : null}
    </div>
  );
}
