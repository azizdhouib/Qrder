import type { Metadata } from "next";
import DemoPresentation from "./DemoPresentation";

export const metadata: Metadata = {
  title: "Qrder — Démo produit",
  description:
    "Découvrez comment Qrder transforme la prise de commande en restaurant grâce au QR code.",
};

export default function DemoPage() {
  return <DemoPresentation />;
}
