# Stock Quotes localStorage Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache the last-fetched stock quotes in localStorage so that when the user opens the Assets tab, the component renders the previous session's prices immediately instead of jumping from 0/-- to real values after the network fetch completes.

**Architecture:** Modify `useStockQuotes` in `lib/swr-hooks.ts` to read a localStorage fallback before SWR fires and write back on successful fetch. Pass `userId` from `AssetOverview` to build a per-user, per-symbol-set cache key. No new files, no new dependencies.

**Tech Stack:** SWR `fallbackData`, `localStorage`, `useMemo`, TypeScript

---

## File Map

| File | Change |
|---|---|
| `lib/swr-hooks.ts` | Add `userId` param to `useStockQuotes`; read/write localStorage |
| `components/AssetOverview.tsx` | Pass `user?.id` to `useStockQuotes` |

---

### Task 1: Update `useStockQuotes` signature and add localStorage read

**Files:**
- Modify: `lib/swr-hooks.ts`

- [ ] **Step 1: Add `useMemo` to the import**

Open `lib/swr-hooks.ts`. The first line currently imports from `"swr"` only. Add `useMemo` from React:

```ts
import { useMemo } from "react";
import useSWR, { type SWRConfiguration } from "swr";
```

- [ ] **Step 2: Replace the `useStockQuotes` function**

Find the existing function (lines ~136–145):

```ts
/** Stock quotes from API. Key depends on symbols so it re-fetches when holdings change. */
export function useStockQuotes(symbols: string[]) {
  const sorted = [...symbols].sort();
  const key = sorted.length > 0 ? ["stock_quotes", ...sorted] : null;

  return useSWR<Record<string, StockQuote>>(
    key,
    async () => getStockQuotes(sorted),
    { ...defaultConfig, dedupingInterval: 60_000 }, // quotes 1 min dedup
  );
}
```

Replace it entirely with:

```ts
/** Stock quotes from API. Key depends on symbols so it re-fetches when holdings change.
 *  Persists last-fetched quotes to localStorage (keyed by userId + symbols) so the
 *  component can render stale-but-real data while the fresh fetch is in flight.
 */
export function useStockQuotes(symbols: string[], userId?: string) {
  const sorted = [...symbols].sort();
  const key = sorted.length > 0 ? ["stock_quotes", ...sorted] : null;

  const cacheKey = userId && sorted.length > 0
    ? `stock_quotes_cache:${userId}:${sorted.join(",")}`
    : null;

  const fallbackData = useMemo<Record<string, StockQuote> | undefined>(() => {
    if (!cacheKey) return undefined;
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as Record<string, StockQuote>) : undefined;
    } catch {
      return undefined;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return useSWR<Record<string, StockQuote>>(
    key,
    async () => getStockQuotes(sorted),
    {
      ...defaultConfig,
      dedupingInterval: 60_000,
      fallbackData,
      onSuccess(data) {
        if (!cacheKey) return;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // localStorage full or unavailable — fail silently
        }
      },
    },
  );
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd /Users/elissali/github/money-tracker && npm run build 2>&1 | tail -20
```

Expected: build succeeds (exit 0). If TypeScript errors appear about `useMemo`, check the React import at the top of the file.

- [ ] **Step 4: Commit**

```bash
git add lib/swr-hooks.ts
git commit -m "feat: persist stock quotes to localStorage for instant render on revisit"
```

---

### Task 2: Pass `userId` from `AssetOverview`

**Files:**
- Modify: `components/AssetOverview.tsx`

- [ ] **Step 1: Update the `useStockQuotes` call**

Find the line in `AssetOverview.tsx` (around line 40):

```ts
const { data: quotes, isLoading: quotesLoading } = useStockQuotes(stockSymbols);
```

Replace with:

```ts
const { data: quotes, isLoading: quotesLoading } = useStockQuotes(stockSymbols, user?.id);
```

`user` is already destructured from `useApp()` on line 33 — no other changes needed.

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/elissali/github/money-tracker && npm run build 2>&1 | tail -20
```

Expected: build succeeds (exit 0), no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/AssetOverview.tsx
git commit -m "feat: pass userId to useStockQuotes to enable per-user localStorage cache"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

```bash
cd /Users/elissali/github/money-tracker && npm run dev
```

Open `http://localhost:3000` and log in.

- [ ] **Step 2: Populate the cache (first visit)**

Navigate to the Assets tab. Wait for stock quotes to fully load (market value and P&L numbers appear). Open DevTools → Application → Local Storage → `http://localhost:3000`. Confirm a key matching `stock_quotes_cache:<userId>:<symbols>` exists with a JSON object of quote data.

- [ ] **Step 3: Verify instant render on revisit**

Navigate away (e.g. to Transactions), then back to Assets. The stock card should show the previous session's market value and P&L immediately — no `--` flash, no jump from 0. A fresh fetch still fires in the background and silently updates the numbers when it resolves.

- [ ] **Step 4: Verify new portfolio / no cache**

In DevTools → Application → Local Storage, delete the `stock_quotes_cache:…` key. Reload and navigate to Assets. The stock card should show `--` while loading (existing behaviour, no regression).

- [ ] **Step 5: Verify symbol set change clears stale cache**

If you have multiple stock symbols, note the cache key. Adding or removing a holding changes the symbol set → the cache key no longer matches → no stale fallback is used. Confirm by adding a new holding in `/stocks`, returning to Assets, and verifying the stock card shows loading state (not a stale value with the old symbol set).
