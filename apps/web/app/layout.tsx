import "./globals.css";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT"],
  variable: "--font-display"
});

export const metadata = {
  title: "Qrder",
  description: "SaaS QR ordering for restaurants"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
