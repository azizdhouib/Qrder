import "./globals.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Script from "next/script";
import ThemeToggle from "@/components/ThemeToggle";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter"
});

const themeInitScript = `(function(){try{var k="qrder-theme";var s=localStorage.getItem(k);var q=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=document.documentElement;if(s==="dark"||(s!=="light"&&q)){d.setAttribute("data-theme","dark");}else{d.setAttribute("data-theme","light");}}catch(e){}})();`;

export const metadata = {
  title: "Qrder",
  description: "SaaS QR ordering for restaurants"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="qrder-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
