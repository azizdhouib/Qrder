"use client";

import { useOffline } from "@/lib/offline/OfflineContext";

export function ConnectionPill() {
  const { online, pendingOutbox, syncing } = useOffline();

  if (online && pendingOutbox === 0 && !syncing) return null;

  const label = !online
    ? "Hors ligne"
    : syncing
      ? "Synchronisation…"
      : pendingOutbox > 0
        ? `En attente (${pendingOutbox})`
        : "";

  return (
    <div
      className="connection-pill"
      role="status"
      aria-live="polite"
      title={online ? "Les actions sont mises en file et envoyées automatiquement." : "Mode hors ligne — données locales."}
    >
      <span className={`connection-pill-dot ${online ? "connection-pill-dot--online" : ""}`} />
      <span className="connection-pill-label">{label}</span>
    </div>
  );
}
