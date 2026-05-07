import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
if (process.env.NODE_ENV === "production" && !apiUrl) {
  throw new Error(
    "Build production: définis NEXT_PUBLIC_API_URL (URL publique de l'API, ex. https://api-production-xxxx.up.railway.app). " +
      "Sans ça le bundle utilise localhost:4000 et la connexion échoue en prod."
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;
