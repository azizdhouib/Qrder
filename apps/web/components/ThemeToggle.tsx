"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("qrder-theme") as Theme | null;
    const fromDom = document.documentElement.getAttribute("data-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      applyTheme(stored);
    } else if (fromDom === "light" || fromDom === "dark") {
      setTheme(fromDom);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onPrefChange = () => {
      if (localStorage.getItem("qrder-theme")) return;
      const next: Theme = mq.matches ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };
    mq.addEventListener("change", onPrefChange);
    return () => mq.removeEventListener("change", onPrefChange);
  }, []);

  if (!mounted) {
    return null;
  }

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("qrder-theme", next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "light" ? "Activer le mode sombre" : "Activer le mode clair"}
      aria-pressed={theme === "dark"}
    >
      {theme === "light" ? <Moon size={18} strokeWidth={2} aria-hidden /> : <Sun size={18} strokeWidth={2} aria-hidden />}
    </button>
  );
}
