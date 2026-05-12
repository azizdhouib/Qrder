"use client";

import type { ReactNode } from "react";
import { OfflineProvider } from "@/lib/offline/OfflineContext";
import { ConnectionPill } from "@/components/ConnectionPill";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <OfflineProvider>
      {children}
      <ConnectionPill />
      <ServiceWorkerRegister />
    </OfflineProvider>
  );
}
