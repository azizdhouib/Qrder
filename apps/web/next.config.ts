import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const isCloudDeploy =
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.VERCEL) ||
  process.env.CI === "true";

if (process.env.NODE_ENV === "production" && !apiUrl) {
  if (isCloudDeploy) {
    throw new Error(
      "Build production (CI / Railway / Vercel): définis NEXT_PUBLIC_API_URL avec l'URL publique de l'API " +
        "(ex. https://api-production-xxxx.up.railway.app). Sans ça le bundle utilise localhost:4000."
    );
  }
  // Build local (ex. `next build` / runtime:stable) : les variables ne sont souvent pas chargées depuis la racine du monorepo.
  // eslint-disable-next-line no-console
  console.warn(
    "[next.config] NEXT_PUBLIC_API_URL absent au build — le bundle utilisera http://localhost:4000 (OK pour runtime:stable). " +
      "Pour tester l'API distante : NEXT_PUBLIC_API_URL=https://... npm run build -w apps/web"
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;
