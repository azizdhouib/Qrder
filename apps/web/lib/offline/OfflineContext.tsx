"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { flushOfflineOutbox } from "@/lib/offline/syncFlush";
import { outboxCount } from "@/lib/offline/db";
import { readNavigatorOnline } from "@/lib/offline/network";

type OfflineState = {
  online: boolean;
  pendingOutbox: number;
  syncing: boolean;
  refreshPending: () => Promise<void>;
  flushNow: () => Promise<void>;
};

const OfflineContext = createContext<OfflineState | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pendingOutbox, setPendingOutbox] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    try {
      const n = await outboxCount();
      setPendingOutbox(n);
    } catch {
      setPendingOutbox(0);
    }
  }, []);

  const flushNow = useCallback(async () => {
    if (!readNavigatorOnline()) return;
    setSyncing(true);
    try {
      await flushOfflineOutbox();
    } finally {
      setSyncing(false);
      await refreshPending();
    }
  }, [refreshPending]);

  useEffect(() => {
    setOnline(readNavigatorOnline());
    void refreshPending();

    const onOnline = () => {
      setOnline(true);
      void flushNow();
    };
    const onOffline = () => setOnline(false);
    const onOutbox = () => void refreshPending();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("qrder-outbox-changed", onOutbox);

    const id = window.setInterval(() => {
      if (readNavigatorOnline()) void flushNow();
    }, 25_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("qrder-outbox-changed", onOutbox);
      window.clearInterval(id);
    };
  }, [flushNow, refreshPending]);

  const value = useMemo(
    () => ({ online, pendingOutbox, syncing, refreshPending, flushNow }),
    [online, pendingOutbox, syncing, refreshPending, flushNow]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    return {
      online: true,
      pendingOutbox: 0,
      syncing: false,
      refreshPending: async () => {},
      flushNow: async () => {}
    };
  }
  return ctx;
}
