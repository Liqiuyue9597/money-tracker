# Demo Account Feature Design

**Date:** 2026-05-12  
**Status:** Approved  
**Scope:** Local dev environment only

## Problem

The app currently only has the owner's personal account. When showing the app to others, there's no way to demo it without exposing personal financial data.

## Solution

A "体验 Demo" (Try Demo) button on the login page, visible only in local development (`NEXT_PUBLIC_DEMO_MODE=true`). One click logs into a pre-seeded demo Supabase account with realistic sample data.

---

## Architecture

### 1. Environment Variables (`.env.local`, not committed)

```
NEXT_PUBLIC_DEMO_MODE=true
DEMO_EMAIL=demo@moneytracker.local
DEMO_PASSWORD=<chosen password>
```

- `NEXT_PUBLIC_DEMO_MODE` controls button visibility (client-readable)
- `DEMO_EMAIL` / `DEMO_PASSWORD` are server-only (no `NEXT_PUBLIC_` prefix) — the button triggers a server action or API route that reads them and calls `signInWithPassword`

### 2. AuthForm.tsx Change

When `process.env.NEXT_PUBLIC_DEMO_MODE === 'true'`, render a "体验 Demo" button below the divider. Clicking it calls a `/api/demo-login` route (POST), which reads the server-side env vars and returns a Supabase session, then calls `supabase.auth.setSession()` client-side to log the user in.

> **Why a server route?** `DEMO_PASSWORD` must not be exposed to the browser. Only `NEXT_PUBLIC_DEMO_MODE` is client-readable.

### 3. Demo User in Supabase

- Email: `demo@moneytracker.local`  
- Created manually via Supabase Dashboard → Authentication → Users  
- Password stored only in `.env.local`

### 4. Seed Data (one-time SQL script)

Run once in Supabase SQL editor after creating the demo user. Script uses the demo user's UUID.

**Accounts (cash)**

| Name | Balance |
|------|---------|
| 招商银行储蓄卡 | ¥12,580 |
| 微信支付 | ¥1,200 |
| 招商银行信用卡 | -¥3,400 |
| 支付宝 | ¥800 |

**Transactions** (~25 records over last 30 days)
- Expenses: 餐饮, 交通, 购物, 娱乐
- Income: 工资 (monthly), 兼职

**Stock Holdings**
- AAPL: 10 shares, buy price $150
- MSFT: 5 shares, buy price $280

**Crypto Holdings**
- BTC: 0.05, buy price $40,000

---

## Files Changed

| File | Change |
|------|--------|
| `components/AuthForm.tsx` | Add demo button (env-gated) |
| `app/api/demo-login/route.ts` | New: server route that returns Supabase session |
| `.env.local` | Add 3 env vars (not committed) |
| `.env.local.example` | Document the new vars (committed) |

---

## Security

- Demo password never reaches the browser
- Button and route are entirely absent in production (env var not set)
- Demo user has its own `user_id` with normal RLS — cannot access other users' data

## Out of Scope

- Resetting demo data automatically after each session
- Long-term persistent demo link
