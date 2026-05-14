import Link from "next/link";
import { QrderLogo } from "@/components/QrderLogo";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <QrderLogo markOnly className="offline-page-logo mx-auto opacity-90" />
      <p className="text-[17px] font-medium tracking-tight text-foreground">Hors connexion</p>
      <p className="max-w-sm text-[15px] text-muted-foreground">
        Certaines pages restent disponibles. Reconnectez-vous pour synchroniser avec le serveur.
      </p>
      <Link href="/" className="text-[15px] font-medium text-primary underline-offset-4 hover:underline">
        Accueil
      </Link>
    </main>
  );
}
