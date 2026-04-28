# Stock Quotes localStorage Cache

**Date:** 2026-04-28  
**Status:** Approved

## Problem

Every time the user opens the Assets tab, `useStockQuotes` starts with `data = undefined` because the SWR in-memory cache is empty. This causes:

- Net worth card: shows a smaller number, then jumps to the real value
- Sankey chart: stock segment starts at 0, then jumps
- Stock card: shows `--` for value and P&L, then jumps to real numbers

The root cause is two-hop loading: first `useStockHoldings` fetches from Supabase, then `useStockQuotes` uses those symbols as its key — so quotes never start loading until holdings resolve. Combined with no persistence between sessions, the initial state is always empty.

## Solution

Persist the last-fetched `quotes` object in localStorage, and pass it as `fallbackData` to SWR on the next render. The component sees populated data immediately; when the real fetch completes, SWR replaces it silently.

## Design

### localStorage Key Format

```
stock_quotes_cache:<userId>:<symbols_sorted_and_joined_by_comma>
```

Example: `stock_quotes_cache:abc123:AAPL,BABA,TSLA`

Including `userId` prevents cache bleed between accounts. Including the sorted symbol list means a changed portfolio doesn't show stale data for removed/added symbols — the key won't match and the cache will be empty (falling back to the existing `--` loading state).

### Hook Changes (`lib/swr-hooks.ts`)

Only `useStockQuotes` is modified. Two additions:

1. **Read cache on call:** Before constructing the SWR call, read `localStorage.getItem(cacheKey)` and parse it as `fallbackData`.
2. **Write cache on success:** Add `onSuccess` to the SWR config — when a fresh fetch completes, write the new quotes to localStorage.

```ts
export function useStockQuotes(symbols: string[], userId?: string) {
  const sorted = [...symbols].sort();
  const key = sorted.length > 0 ? ["stock_quotes", ...sorted] : null;
  const cacheKey = userId && sorted.length > 0
    ? `stock_quotes_cache:${userId}:${sorted.join(",")}`
    : null;

  const fallbackData = useMemo(() => {
    if (!cacheKey) return undefined;
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as Record<string, StockQuote>) : undefined;
    } catch {
      return undefined;
    }
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

### Call Site Change (`components/AssetOverview.tsx`)

`useStockQuotes` needs `userId` to build the cache key:

```ts
// before
const { data: quotes, isLoading: quotesLoading } = useStockQuotes(stockSymbols);

// after
const { data: quotes, isLoading: quotesLoading } = useStockQuotes(stockSymbols, user?.id);
```

No other changes to `AssetOverview.tsx`.

## Data Flow

```
Tab opened (cache exists)
  └─ useStockQuotes
       ├─ reads localStorage → fallbackData = last quotes
       ├─ component renders immediately with last-known prices
       └─ SWR fetches fresh quotes
            └─ success → writes localStorage → component silently updates

Tab opened (no cache or new symbol set)
  └─ fallbackData = undefined
  └─ existing "--" / loading state shown (no regression)
```

## What This Does NOT Change

- `useStockHoldings` — still fetches live from Supabase
- All P&L calculations — still computed from `holdings × quotes`, just with cached quotes as starting point
- Cache invalidation strategy — no TTL; cache is replaced every time a fresh fetch succeeds
- No new dependencies

## Edge Cases

| Scenario | Behavior |
|---|---|
| User adds/removes a holding | Symbol set changes → cache key changes → no fallback → loads fresh |
| localStorage unavailable (private browsing) | `try/catch` swallows errors → no fallback, no crash |
| localStorage full | `setItem` throws → caught silently, old cache remains |
| Multiple accounts | `userId` in key isolates each account's cache |
