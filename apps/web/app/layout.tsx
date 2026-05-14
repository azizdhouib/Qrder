import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Outfit } from "next/font/google";
import Script from "next/script";
import ThemeToggle from "@/components/ThemeToggle";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter"
});

/** Typo du mot « qrder » dans le lockup marque (landing, dashboard, démo). */
const qrderBrand = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-qrder-brand"
});

const themeInitScript = `(function(){try{var k="qrder-theme";var s=localStorage.getItem(k);var q=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=document.documentElement;if(s==="dark"||(s!=="light"&&q)){d.setAttribute("data-theme","dark");}else{d.setAttribute("data-theme","light");}}catch(e){}})();`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" }
  ]
};

export const metadata: Metadata = {
  title: "Qrder",
  description: "SaaS QR ordering for restaurants",
  manifest: "/manifest.webmanifest",
  applicationName: "Qrder",
  appleWebApp: {
    capable: true,
    title: "Qrder",
    statusBarStyle: "default",
    startupImage: [
      {
        url: "/pwa/splash-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
      },
      {
        url: "/pwa/splash-1170x2532.png",
        media: "(orientation: portrait) and (min-height: 2200px)"
      }
    ]
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    apple: [
      { url: "/icons/icon-152.png", sizes: "152x152" },
      { url: "/icons/icon-192.png", sizes: "192x192" }
    ],
    icon: [
      { url: "/icons/icon-72.png", sizes: "72x72", type: "image/png" },
      { url: "/icons/icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/icon-128.png", sizes: "128x128", type: "image/png" },
      { url: "/icons/icon-144.png", sizes: "144x144", type: "image/png" },
      { url: "/icons/icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-384.png", sizes: "384x384", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${qrderBrand.variable}`.trim()} suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Qrder" />
        <meta name="msapplication-TileColor" content="#f5f5f7" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body suppressHydrationWarning>
        <Script id="qrder-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers>{children}</Providers>
        <ThemeToggle />
      </body>
    </html>
  );
}
