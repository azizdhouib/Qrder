"use client";

import { ExportComptaModule } from "@/components/accounting/ExportComptaModule";
import { TokenGate } from "@/components/TokenGate";

export default function ExportComptaPage() {
  return (
    <main className="export-compta-page">
      <TokenGate>{(token) => <ExportComptaModule token={token} />}</TokenGate>
    </main>
  );
}
