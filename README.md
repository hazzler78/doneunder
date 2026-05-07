# doneunder.ai MVP

Production-ready MVP scaffold for a high-trust B2B commercial diving marketplace.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui-style components
- Supabase (Auth, Postgres, Storage-ready)
- Stripe subscriptions
- Vercel AI SDK + xAI Grok

## Included Features

- Public pages: home, pricing, how-it-works, teaser job board
- Dynamic diver ambassador pages at `/{username}`
- Diver, Company, and Admin dashboard routes
- AI API endpoint with structured JSON outputs and audit logging
- Stripe checkout + webhook route scaffolds
- Supabase SQL migration with RLS policies + seed data
- Ocean-themed premium dark UI

## Local Setup

1. Install dependencies:

```bash
npm install
```

1. Create env file:

```bash
copy .env.example .env.local
```

1. Fill required variables in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `XAI_API_KEY`
- `XAI_MODEL` (example: `grok-3-mini`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_149`, `STRIPE_PRICE_199`, `STRIPE_PRICE_249`

1. Run database SQL in Supabase:

- `supabase/migrations/001_init.sql`
- `supabase/seed.sql`

1. Start dev server:

```bash
npm run dev
```

## Deploy to Vercel

1. Push project to GitHub.
2. Import repository in Vercel.
3. Add all environment variables from `.env.example`.
4. Deploy:

```bash
vercel --prod
```

