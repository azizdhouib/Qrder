import type { Metadata } from "next";
import LandingMarketing from "@/components/LandingMarketing";

export const metadata: Metadata = {
  title: "Qrder — Scannez. Commandez. On s'occupe du reste.",
  description:
    "La solution de commande à table simple, rapide et pensée pour les restaurants. QR code, menu mobile, cuisine en temps réel."
};

export default function HomePage() {
  return <LandingMarketing />;
}
