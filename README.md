# Qrder MVP

Starter fullstack pour un SaaS de commande QR en restaurant.

## Stack

- `apps/api`: Express + Prisma + PostgreSQL + Socket.IO
- `apps/web`: Next.js (mobile client + dashboard + kitchen)
- Multi-tenant via `restaurantId` sur toutes les entites metier

## Fonctionnalites incluses

- Inscription / connexion restaurant (JWT)
- Creation tables et generation QR par table
- Gestion menu (categories + produits + options)
- Commande client depuis URL QR
- Ecran cuisine avec mise a jour de statut en temps reel

## Lancer en local

1. Copier les variables d'environnement:

   - copier `.env.example` vers `.env`

2. Lancer Postgres:

   - `docker compose up -d`

3. Installer les dependances:

   - `npm install`

4. Initialiser la DB:

   - `npm run prisma:generate -w apps/api`
   - `npm run prisma:migrate -w apps/api -- --name init`
   - `npm run prisma:seed -w apps/api`

5. Démarrer API + Web:

   - terminal 1: `npm run dev -w apps/api`
   - terminal 2: `npm run dev -w apps/web`

## URLs utiles

- Web home: `http://localhost:3000`
- Dashboard auth: `http://localhost:3000/dashboard/auth`
- Dashboard tables: `http://localhost:3000/dashboard/tables`
- Dashboard cuisine: `http://localhost:3000/dashboard/kitchen`
- API health: `http://localhost:4000/health`

## Flux demo rapide

1. Creer un compte resto dans `/dashboard/auth`
2. Creer des categories + produits dans `/dashboard/menu`
3. Creer une table dans `/dashboard/tables` puis ouvrir le QR
4. Passer commande sur la page publique
5. Suivre la commande dans `/dashboard/kitchen`
