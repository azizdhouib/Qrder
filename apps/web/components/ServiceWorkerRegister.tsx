"use client";

import { useEffect, useRef } from "react";

const SW_URL = "/offline-sw.js";

function shouldRegisterSw(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "production") return true;
  return process.env.NEXT_PUBLIC_PWA_SW_DEV === "1";
}

export function ServiceWorkerRegister() {
  const reloaded = useRef(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!shouldRegisterSw()) return;

    let hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (!hadController) {
        hadController = Boolean(navigator.serviceWorker.controller);
        return;
      }
      if (reloaded.current) return;
      reloaded.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
        regRef.current = reg;

        const pingSkip = (sw: ServiceWorker | null) => {
          if (sw && sw.state === "installed") {
            try {
              sw.postMessage({ type: "SKIP_WAITING" });
            } catch {
              /* ignore */
            }
          }
        };

        if (reg.installing) {
          reg.installing.addEventListener("statechange", () => pingSkip(reg.installing));
        }
        pingSkip(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed") pingSkip(nw);
          });
        });
      } catch {
        return;
      }
    };

    void register();

    const onFocus = () => {
      void regRef.current?.update();
    };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => void regRef.current?.update(), 60 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      regRef.current = null;
    };
  }, []);

  return null;
}
