# Contracts Portal (Vite + React)

Web portal ready for deployment to Vercel with Supabase auth.

## 1) Install and run locally

```bash
npm install
npm run dev
```

## 2) Environment setup

Copy `.env.example` to `.env` and set values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_REDIRECT_URL` (for local dev, use `http://localhost:5173`)

## 3) Supabase redirect URLs

In Supabase Auth URL configuration, add:
- Local: `http://localhost:5173`
- Vercel prod: `https://your-contracts-portal.vercel.app`

## 4) Deploy to Vercel

1. Import this folder into Vercel.
2. Set the three environment variables.
3. Deploy.

`vercel.json` already includes SPA rewrite support.

## 5) What is included

- Login / Sign up / Forgot password
- Email confirmation redirect
- Password recovery flow
- Basic contract forms dashboard

## 6) Cross-project user import (maintenance-admin + sitebatch-inspections)

This portal can import users from external Supabase projects using the Edge Function:
- `supabase/functions/import-external-users`

### Required function secrets

Set these in the contracts portal Supabase project:

- `MAINTENANCE_ADMIN_URL`
- `MAINTENANCE_ADMIN_SERVICE_ROLE_KEY`
- `SITEBATCH_INSPECTIONS_URL`
- `SITEBATCH_INSPECTIONS_SERVICE_ROLE_KEY`

Example CLI commands:

```bash
supabase secrets set MAINTENANCE_ADMIN_URL=https://zebksrihswwwlejdiboq.supabase.co
supabase secrets set MAINTENANCE_ADMIN_SERVICE_ROLE_KEY=YOUR_MAINTENANCE_SERVICE_ROLE_KEY
supabase secrets set SITEBATCH_INSPECTIONS_URL=https://doeefinncekkahjgpcig.supabase.co
supabase secrets set SITEBATCH_INSPECTIONS_SERVICE_ROLE_KEY=YOUR_SITEBATCH_SERVICE_ROLE_KEY
```

Then deploy migrations and functions:

```bash
supabase db push --linked --yes
supabase functions deploy import-external-users
```
