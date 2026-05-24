# LawnPro — Lawn Business Manager

A modern full-stack field operations platform for residential lawn care businesses. Built with Next.js, Supabase, and Tailwind CSS.

---

## Features

- **Dashboard** — Today's jobs, unpaid invoices, revenue summaries, quick actions
- **Customer Management** — Full profiles with service notes, gate codes, history
- **Scheduling** — Week/day calendar views, rain delay workflow, job creation
- **Job Tracking** — Complete/skip/reschedule jobs, employee notes, photo upload ready
- **Employee Management** — Per-job payout tracking, earnings reports by week/month
- **Invoicing** — Create, send, and mark paid; line items, PDF-ready print layout
- **Route Manager** — Daily route list per employee, one-tap complete, Google Maps links
- **Dark mode** — Full dark/light mode support
- **Mobile-first** — Bottom nav on mobile, sidebar on desktop

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Icons | Lucide React |
| Dates | date-fns |

---

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Project Settings → API**
3. Copy your **Project URL** and **anon key**

### 2. Configure Environment Variables

Update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Run the Database Schema

In your Supabase project:
1. Go to **SQL Editor**
2. Open and run `supabase/migrations/001_initial_schema.sql`
3. This creates all tables, indexes, triggers, and 10 sample customers + 3 employees

### 4. Run Locally

```bash
npm install --cache /tmp/npm-cache
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel

```bash
npx vercel --prod
```

Add your environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Database Schema

```
customers        — Client profiles (name, address, price, frequency, gate code, notes)
employees        — Team members with default per-job payout rate
schedules        — Recurring schedule definitions (weekly/biweekly)
jobs             — Individual job instances (scheduled, completed, skipped)
invoices         — Invoice headers (status: draft/sent/paid/overdue)
invoice_items    — Line items linking to jobs
```

---

## Future Integrations (pre-wired)

- **Stripe** — Invoice payment links (invoice model is ready)
- **Twilio SMS** — Customer notifications (add to invoice send flow)
- **Google Maps** — Full route optimization (Maps links already embedded)
- **Customer Portal** — Clients can view their invoices and history
- **Supabase Auth** — Login/auth stubbed in middleware.ts

---

## Project Structure

```
app/
  page.tsx                — Dashboard
  customers/
    page.tsx              — Customer list
    new/page.tsx          — Add customer
    [id]/page.tsx         — Customer profile
  schedule/page.tsx       — Calendar scheduling
  jobs/
    page.tsx              — Job list
    [id]/page.tsx         — Job detail
  employees/
    page.tsx              — Employee list
    [id]/page.tsx         — Employee profile + earnings
  invoices/
    page.tsx              — Invoice list
    new/page.tsx          — Create invoice
    [id]/page.tsx         — Invoice detail + print
  routes/page.tsx         — Daily route manager
components/
  ui/                     — Button, Card, Badge, Modal, Input
  nav/                    — Sidebar, MobileNav
lib/
  supabase/               — Client/server Supabase helpers
  utils.ts                — Formatting utilities
types/index.ts            — TypeScript types
supabase/migrations/      — Database schema SQL
```
