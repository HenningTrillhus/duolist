# Duolist

A shared shopping list and dinner planner for two people, built as a mobile-first web app that installs like a native one.

**Live:** [duolist-alpha.vercel.app](https://duolist-alpha.vercel.app)

The interface is in Norwegian. Changes show up on both phones instantly, and you can get a push notification when the other person adds something.

## Features

**Lists**
- Several lists of different kinds (groceries, to-dos, shopping) with a list switcher and list management
- Items with quantity and unit, a store (items are grouped by store), photo and link attachments, and inline editing
- Every item is colour-tagged with who added it
- Drag to reorder to-do items by priority
- Completing an item animates it to the bottom with confetti, and a history shows what was completed across all lists

**Dinner planner**
- A calendar with one planned dinner per day, plus a day slider
- Each dinner can have a main course, side dish, starter and dessert
- Recipes can be picked from the separate [Min Munch](https://github.com/HenningTrillhus/Min-Munch) recipe book, which shows their photos on the day card

**Isopod tab**
- A shared "wish" speech bubble with an optional photo, and a history of every wish

**Everywhere**
- Realtime sync between devices
- Push notifications that you opt into per item and for dinners
- Installable as an app (web manifest and service worker)
- Light and dark theme, and animations tuned for phones

## Tech

- **React 19** and **TypeScript**, built with **Vite**
- **Framer Motion** for animations
- **Supabase**: Postgres, Realtime, Storage for photos, and an Edge Function for push
- **Web Push** with VAPID keys
- **Oxlint** for linting
- Deployed on **Vercel**

## Getting started

You need Node.js and a free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env
npm run dev
```

Fill in `.env`:

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Your Duolist Supabase project |
| `VITE_MINMUNCH_SUPABASE_URL`, `VITE_MINMUNCH_SUPABASE_ANON_KEY` | The Min Munch project, used read-only for the recipe picker |
| `VITE_VAPID_PUBLIC_KEY` | Public key for push notifications |

### Set up the database

Open the Supabase SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, the realtime setup, the trigger that keeps list timestamps current, and the storage bucket for item photos.

### Set up push notifications (optional)

1. Generate a key pair with `npx web-push generate-vapid-keys`.
2. Put the public key in `VITE_VAPID_PUBLIC_KEY`.
3. In Supabase, create an Edge Function named `send-push` from [`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts).
4. Add the secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (for example `mailto:you@example.com`) to the function.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with Oxlint |

## Project structure

```
src/App.tsx                          The app: lists, dinner planner and Isopod tab
src/lib/supabase.ts                  Supabase client for Duolist
src/lib/minMunch.ts                  Read-only client for the Min Munch recipe book
src/lib/push.ts                      Push subscription helpers
public/sw.js                         Service worker that shows push notifications
supabase/schema.sql                  Database schema, policies and storage bucket
supabase/functions/send-push/        Edge Function that sends the push notifications
```

## Good to know

- **There is no login.** Row-level security allows anyone with the public anon key to read and write, which is fine for a small list shared by two people. Add authentication before using it any more widely.
- **The two user names are hard-coded** in `supabase/schema.sql` and in the app. Change them to your own names before running it.

---

## På norsk

Duolist er en delt handleliste og middagsplanlegger for to. Appen er laget for mobil, synkroniserer i sanntid, kan installeres som en app og sender push-varsler. Se over for oppsett og teknologi.
