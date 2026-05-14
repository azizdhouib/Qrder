"use client";

import type { ReactNode } from "react";
import { OfflineProvider } from "@/lib/offline/OfflineContext";
import { ConnectionPill } from "@/components/ConnectionPill";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { PwaStandaloneClass } from "@/components/PwaStandaloneClass";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <OfflineProvider>
      <PwaStandaloneClass />
      {children}
      <ConnectionPill />
      <PwaInstallButton />
      <ServiceWorkerRegister />
    </OfflineProvider>
  );
}
