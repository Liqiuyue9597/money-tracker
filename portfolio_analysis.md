# Portfolio Data Calculation Analysis - Money Tracker App

## Executive Summary

The app displays investment portfolio data in **TWO different ways** across different components:

1. **AssetOverview.tsx** (Summary on `/assets` page - "总资产")
2. **StockPortfolio.tsx** (Detailed page on `/stocks` page - "投资组合")
3. **Dashboard.tsx** (Quick summary on home page)

These locations calculate totals **DIFFERENTLY** in critical ways, which can cause discrepancies.

---

## Data Flow Architecture

```
Supabase Database
    ↓
SWR Hooks (lib/swr-hooks.ts)
    ├── useStockHoldings() → stock_holdings table
    ├── useStockQuotes() → API → /api/stocks/route.ts
    ├── useCryptoHoldings() → crypto_holdings table
    ├── useCryptoPrices() → API → /api/crypto/route.ts
    └── useExchangeRates() → API → /api/exchange/route.ts
    ↓
Components (AssetOverview, StockPortfolio, Dashboard)
    ├── Convert currencies using convertCurrency()
    └── Display totals
```

### Key Data Fetches:

| Source | Data | Component Usage |
|--------|------|-----------------|
| `stock_holdings` table | Holdings with buy_price, quantity, currency, manual_price | All 3 components |
| `/api/stocks` | Current market prices | All 3 components |
| `crypto_holdings` table | Holdings with buy_price, quantity | AssetOverview only |
| `/api/crypto` | Current crypto prices in USD | AssetOverview only |
| `/api/exchange` | Exchange rates relative to base currency | All 3 components |
| Accounts | Cash balances by currency | AssetOverview & Dashboard |

---

## 1. STOCK PORTFOLIO CALCULATIONS

### 1.1 AssetOverview.tsx (Summary View)

**Location:** Lines 52-66

```typescript
const { stockValue, stockCost, stockPnl, stockPnlPct } = useMemo(() => {
  if (!holdings || holdings.length === 0 || !quotes) 
    return { stockValue: 0, stockCost: 0, stockPnl: 0, stockPnlPct: 0 };
  
  let totalVal = 0, totalCost = 0;
  for (const h of holdings) {
    const q = quotes[h.symbol];
    const cur = (h.currency || "USD") as Currency;
    
    const cost = Number(h.buy_price) * Number(h.quantity);
    const val = q ? q.price * Number(h.quantity) : cost;
    
    // ⚠️ CURRENCY CONVERSION: converts per-holding to mainCurrency
    totalCost += convertCurrency(cost, cur, mainCurrency, rateMap);
    totalVal += convertCurrency(val, cur, mainCurrency, rateMap);
  }
  
  const pnl = totalVal - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
  return { stockValue: totalVal, stockCost: totalCost, stockPnl: pnl, stockPnlPct: pnlPct };
}, [holdings, quotes, mainCurrency, rateMap]);
```

**Calculation Logic:**
1. For each holding: `cost = buy_price × quantity`
2. For each holding: `value = current_price × quantity` (or cost if no price)
3. **CONVERTS each holding's cost & value to mainCurrency** before summing
4. Final totals are in mainCurrency
5. Respects `mainCurrency` from AppProvider (can be CNY, USD, or HKD)

**Formula:**
```
- totalCost = Σ convertCurrency(buy_price × qty, holding.currency → mainCurrency)
- totalValue = Σ convertCurrency(current_price × qty, holding.currency → mainCurrency)
- PnL = totalValue - totalCost
- PnL% = (PnL / totalCost) × 100
```

---

### 1.2 StockPortfolio.tsx (Detailed View)

**Location:** Lines 194-225

```typescript
const typeTotals = useMemo(() => {
  const totals: Record<StockAssetType, { cost: number; value: number }> = {
    fund: { cost: 0, value: 0 },
    hk: { cost: 0, value: 0 },
    us: { cost: 0, value: 0 },
  };

  Object.entries(groupedHoldings).forEach(([type, items]) => {
    items.forEach((h) => {
      const cost = Number(h.buy_price) * Number(h.quantity);
      const currentPrice = getEffectivePrice(h.symbol);
      const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
      
      // ⚠️ NO CURRENCY CONVERSION - sums in original currency!
      totals[type as StockAssetType].cost += cost;
      totals[type as StockAssetType].value += value;
    });
  });
  return totals;
}, [groupedHoldings, getEffectivePrice]);

const totalCost = useMemo(() =>
  Object.values(typeTotals).reduce((sum, t) => sum + t.cost, 0),
  [typeTotals]
);

const totalValue = useMemo(() =>
  Object.values(typeTotals).reduce((sum, t) => sum + t.value, 0),
  [typeTotals]
);
```

**Calculation Logic:**
1. For each holding: `cost = buy_price × quantity`
2. For each holding: `value = current_price × quantity`
3. **DOES NOT convert to mainCurrency** - sums in original currency
4. Totals displayed in USD (hardcoded in display)
5. Type-specific totals (fund/HK/US) calculated first, then summed

**Formula:**
```
- totalCost = Σ (buy_price × qty) [NO currency conversion]
- totalValue = Σ (current_price × qty) [NO currency conversion]
- Displayed as: $ (always USD currency indicator)
```

**Key Difference:** The effective price logic:

```typescript
const getEffectivePrice = useCallback((sym: string): number => {
  const quote = quotes[sym];
  if (quote && quote.price > 0) return quote.price;
  // Fall back to manual_price from DB
  const holding = holdings.find((h) => h.symbol === sym);
  if (holding?.manual_price != null && holding.manual_price > 0) 
    return holding.manual_price;
  return 0;
}, [quotes, holdings]);
```

This uses **manual_price** from DB if API quote is not available.

---

### 1.3 Dashboard.tsx (Quick Summary)

**Location:** Lines 61-73

```typescript
const { stockValue, stockCost, stockPnL } = useMemo(() => {
  if (!holdings || holdings.length === 0 || !quotes) 
    return { stockValue: 0, stockCost: 0, stockPnL: 0 };
  
  let totalVal = 0, totalCost = 0;
  for (const h of holdings) {
    const q = quotes[h.symbol];
    const cur = (h.currency || "USD") as Currency;
    
    const cost = Number(h.buy_price) * Number(h.quantity);
    const val = q ? q.price * Number(h.quantity) : cost;
    
    // ✅ CONVERTS to mainCurrency (SAME as AssetOverview)
    totalCost += convertCurrency(cost, cur, mainCurrency, rateMap);
    totalVal += convertCurrency(val, cur, mainCurrency, rateMap);
  }
  return { stockValue: totalVal, stockCost: totalCost, stockPnL: totalVal - totalCost };
}, [holdings, quotes, mainCurrency, rateMap]);
```

**Identical to AssetOverview** - converts to mainCurrency before summing.

---

## 2. CRYPTO PORTFOLIO CALCULATIONS

### 2.1 AssetOverview.tsx (Only Place Crypto is Displayed)

**Location:** Lines 74-82

```typescript
const { totalCryptoValue, totalCryptoCost } = useMemo(() => {
  let value = 0, cost = 0;
  for (const h of (cryptoHoldings ?? [])) {
    const price = cryptoPrices?.[h.symbol]?.usd || 0;  // ⚠️ Always USD
    value += price * Number(h.quantity);
    cost += Number(h.buy_price) * Number(h.quantity);
  }
  return { totalCryptoValue: value, totalCryptoCost: cost };
}, [cryptoHoldings, cryptoPrices]);
```

**Calculation Logic:**
1. Crypto prices are **ALWAYS in USD** (from API)
2. Buy price stored in database **as-is** (likely USD but not enforced)
3. **NO currency conversion** - totals in USD
4. Later converted to mainCurrency when added to net worth

**Formula:**
```
- totalCryptoValue = Σ (crypto_price_usd × qty)  [USD]
- totalCryptoCost = Σ (buy_price × qty)  [USD]
- Then added to net worth: convertCurrency(totalCryptoValue, "USD", mainCurrency, rateMap)
```

**Net Worth Addition (Line 93):**
```typescript
if (totalCryptoValue > 0) 
  netWorth += convertCurrency(totalCryptoValue, "USD", mainCurrency, rateMap);
```

---

## 3. CURRENCY CONVERSION FUNCTION

**Location:** `lib/exchange.ts` Lines 27-46

```typescript
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return amount;

  const fromRate = rates[from];
  const toRate = rates[to];

  if (fromRate == null) {
    console.warn(`Missing exchange rate for "${from}", treating as 1`);
  }
  if (toRate == null) {
    console.warn(`Missing exchange rate for "${to}", treating as 1`);
  }

  return (amount / (fromRate ?? 1)) * (toRate ?? 1);
}
```

**Key Issue:** 
- If rates are provided as "rates relative to a base", this needs the rates object to contain BOTH the from and to currencies
- Example: If `rates = { CNY: 1, USD: 0.137, HKD: 1.07 }` (base CNY), converting USD→CNY would be: `(1 / 0.137) * 1 = 7.30`

---

## 4. EXCHANGE RATES API

**Location:** `app/api/exchange/route.ts`

```typescript
// Returns rates for base currency
const result = {
  base,
  rates: relevantRates,  // { CNY: ..., USD: ..., HKD: ... } all relative to base
  updated: ...,
};
```

**Rate Lookup Pattern:**
- Called with `base` parameter (e.g., `?base=CNY`)
- Returns rates object where each rate is: `1 base_currency = rate * target_currency`
- Example: Base CNY → `{ CNY: 1, USD: 0.137, HKD: 1.07 }` means `1 CNY = 0.137 USD`

---

## 5. DIFFERENCES SUMMARY TABLE

| Aspect | AssetOverview | StockPortfolio | Dashboard |
|--------|---------------|--------------------|-----------|
| **Stock Cost** | Converted to mainCurrency | NOT converted (mixed) | Converted to mainCurrency |
| **Stock Value** | Converted to mainCurrency | NOT converted (mixed) | Converted to mainCurrency |
| **Display Currency** | mainCurrency | Always USD | mainCurrency |
| **Price Source** | API or cost | API, manual, or cost | API or cost |
| **Manual Price Support** | ❌ No | ✅ Yes (via DB) | ❌ No |
| **Crypto Included** | ✅ Yes (in net worth) | ❌ No | ❌ No |
| **Account Balances** | ✅ Yes | ❌ No | ✅ Yes |

---

## 6. ROOT CAUSES OF DISCREPANCIES

### Issue 1: Currency Conversion Timing
**AssetOverview & Dashboard:**
```
1 CNY holding: buy=10 CNY, price=11 CNY, qty=1
Cost: convertCurrency(10, CNY, USD) = 10 / 7.3 = 1.37 USD
Value: convertCurrency(11, CNY, USD) = 11 / 7.3 = 1.51 USD
```

**StockPortfolio:**
```
1 CNY holding: buy=10 CNY, price=11 CNY, qty=1
Cost: 10 CNY (no conversion)
Value: 11 CNY (no conversion)
Result: Totaled with USD holdings → mixed currencies!
```

### Issue 2: Manual Prices
**StockPortfolio** respects `manual_price` from database:
```typescript
if (holding?.manual_price != null && holding.manual_price > 0) 
  return holding.manual_price;
```

**AssetOverview & Dashboard** only use API quotes, ignore manual_price:
```typescript
const val = q ? q.price * Number(h.quantity) : cost;
// Falls back to cost, NOT manual_price
```

### Issue 3: Currency Display
**StockPortfolio always displays USD:**
```typescript
${totalValue.toLocaleString("en-US", ...)}  // Always USD
```

But may sum CNY + USD holdings without conversion!

### Issue 4: Crypto Not in StockPortfolio
**StockPortfolio** doesn't include crypto holdings at all - only stocks/funds/HK stocks
**AssetOverview** includes crypto in net worth calculation

---

## 7. SPECIFIC CALCULATION FLOWS

### Flow A: AssetOverview Stock Total
```
1. Load holdings from Supabase
2. Load quotes from /api/stocks (cached 5min)
3. For each holding:
   - Get quote or fall back to buy_price as value
   - Calculate cost = buy_price × qty
   - Calculate value = current_price × qty
   - Convert BOTH to mainCurrency
4. Sum all converted values
5. Display in mainCurrency
6. Include in Net Worth
```

### Flow B: StockPortfolio Stock Total
```
1. Load holdings from Supabase
2. Load quotes from /api/stocks (cached 5min)
3. Group holdings by asset_type (fund/hk/us)
4. For each holding:
   - Check API quote first
   - Fall back to manual_price from DB
   - Fall back to cost
   - Calculate value = currentPrice × qty
   - DO NOT CONVERT
5. Sum per-type totals
6. Sum all type totals (mixed currency)
7. Display as USD (incorrect if CNY/HKD present)
```

### Flow C: Dashboard Stock Total
```
1. Load holdings from Supabase
2. Load quotes from /api/stocks (cached 5min)
3. For each holding:
   - Get quote or fall back to buy_price as value
   - Calculate cost = buy_price × qty
   - Calculate value = current_price × qty
   - Convert BOTH to mainCurrency
4. Sum all converted values
5. Display in mainCurrency
6. DO NOT Include in Net Worth (separate card)
```

---

## 8. NET WORTH CALCULATION

**AssetOverview** (Lines 85-95):

```typescript
const totalNetWorth = useMemo(() => {
  let netWorth = 0;
  
  // 1. Add account balances (converted to mainCurrency)
  for (const acc of accounts) {
    if (!acc.exclude_from_total) {
      netWorth += convertCurrency(Number(acc.balance), acc.currency, mainCurrency, rateMap);
    }
  }
  
  // 2. Add stock portfolio (already in mainCurrency)
  if (stockValue > 0) netWorth += stockValue;
  
  // 3. Add crypto (converted to mainCurrency)
  if (totalCryptoValue > 0) 
    netWorth += convertCurrency(totalCryptoValue, "USD", mainCurrency, rateMap);
  
  return netWorth;
}, [accounts, mainCurrency, rateMap, stockValue, totalCryptoValue]);
```

**Includes:**
- ✅ Cash account balances (filtered by `exclude_from_total`)
- ✅ Stock portfolio value
- ✅ Crypto portfolio value
- ✅ All currency-converted to mainCurrency

---

## 9. POTENTIAL BUGS & ISSUES

### Bug 1: StockPortfolio Mixed Currencies
**Problem:** If you have both USD stocks and CNY funds, they're summed without conversion.
- USD value: 1000 USD
- CNY value: 10000 CNY
- **Displayed:** $11000 USD (WRONG - should be ~$1500)

**Cause:** No `convertCurrency()` call in typeTotals calculation

**Fix:** Apply currency conversion before summing

### Bug 2: Manual Prices Ignored in AssetOverview
**Problem:** You can set manual prices in StockPortfolio, but AssetOverview ignores them.
- In StockPortfolio: Set BTC price to $50k manually
- In AssetOverview: Shows different value (API outdated or missing)

**Cause:** AssetOverview doesn't read `manual_price` from holdings
**Fix:** Check `holding.manual_price` before using API quote

### Bug 3: Dashboard vs AssetOverview May Differ
**Problem:** They both convert to mainCurrency, but:
- AssetOverview fetches rates for mainCurrency
- Dashboard also fetches rates for mainCurrency
- **Should match**, but depends on when rates were last refreshed

**Cause:** Separate API calls, different timing
**Fix:** Deduplicate rate fetching in SWR

### Bug 4: Crypto Buy Prices May Not Be USD
**Problem:** Crypto holdings store `buy_price`, but it's not enforced as USD.
- You buy crypto and store `buy_price: 100` but it's in CNY
- System assumes it's USD
- **Cost calculation is wrong**

**Cause:** No validation on crypto `buy_price` currency
**Fix:** Add `buy_price_currency` field to crypto_holdings or enforce USD

---

## 10. HOW TO VERIFY DISCREPANCIES

### Test Case 1: Single CNY Stock
1. Add 1 Chinese fund (symbol: `000979`, price: ~3 CNY, quantity: 100)
2. Set mainCurrency to USD
3. **AssetOverview:** Should show ~$41 USD (300 CNY ÷ 7.3)
4. **StockPortfolio:** Will show $300 (WRONG - mixed units)

### Test Case 2: Manual Price Update
1. Add a stock to StockPortfolio
2. Set manual price to X
3. Refresh AssetOverview page
4. **StockPortfolio:** Shows manual price value
5. **AssetOverview:** Shows different value (old API quote)

### Test Case 3: Multi-Currency Portfolio
1. Add USD stock (1000 shares @ $1 = $1000)
2. Add HKD stock (1000 shares @ $1 HKD = $1000 HKD ≈ $128 USD)
3. Set mainCurrency to USD
4. **AssetOverview:** Should show ~$1128 USD
5. **StockPortfolio:** Will show $2000 (WRONG - no conversion)

---

## 11. DATA STRUCTURE REFERENCES

### stock_holdings table
```typescript
interface StockHolding {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  buy_price: number;        // In the holding's currency
  quantity: number;
  buy_date: string;
  currency: Currency;       // CNY | USD | HKD
  notes: string;
  manual_price: number | null;  // For manual override
  manual_price_updated_at: string | null;
  created_at: string;
}
```

### crypto_holdings table
```typescript
interface CryptoHolding {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  quantity: number;
  buy_price: number;        // Assumed USD (not enforced)
  buy_date: string;
  notes: string;
  manual_price: number | null;
  manual_price_updated_at: string | null;
  created_at: string;
}
```

### API Response Structures

**Stock Quote (from /api/stocks):**
```typescript
interface StockQuote {
  symbol: string;
  name: string;
  price: number;           // Current price
  change: number;
  changePercent: number;
  previousClose: number;
  high: number;
  low: number;
  open: number;
  currency: "CNY" | "USD" | "HKD";
  isFund: boolean;
  navDate?: string;
}
```

**Exchange Rates (from /api/exchange):**
```typescript
interface ExchangeRates {
  base: string;            // e.g., "CNY"
  rates: Record<string, number>;  // { CNY: 1, USD: 0.137, HKD: 1.07 }
  updated: string;
}
```

---

## 12. RECOMMENDATIONS

### High Priority Fixes

1. **Fix StockPortfolio Currency Conversion** (Critical)
   - Apply `convertCurrency()` in `typeTotals` calculation
   - Use mainCurrency for final display
   - Options: Pass mainCurrency + rateMap as dependencies

2. **Sync Manual Price Usage** (Important)
   - Use same price logic everywhere: API → manual_price → cost
   - Extract `getEffectivePrice()` to shared utility
   - Use in AssetOverview, Dashboard, and StockPortfolio

3. **Validate Crypto Buy Price Currency** (Important)
   - Add `buy_price_currency` field to crypto_holdings
   - Enforce USD if none provided
   - Update calculation to use this field

4. **Deduplicate Rate Fetching** (Nice to Have)
   - Cache exchange rates at a higher level
   - Reduce API calls

### Verification Steps

1. Test with mixed-currency holdings
2. Verify AssetOverview === Dashboard numbers
3. Ensure StockPortfolio shows same totals as AssetOverview (when converted)
4. Test manual price overrides work everywhere

---

## Summary Comparison Table

```
COMPONENT      | STOCK TOTAL | CRYPTO | NET WORTH | MAINCY | MANUAL PRICE
               | CONVERSION  | SHOWN  | INCLUDED | APPLY  | RESPECTED
───────────────┼─────────────┼────────┼──────────┼────────┼──────────────
AssetOverview  | ✅ Yes      | ✅ Yes | ✅ Yes   | ✅ Yes | ❌ No
StockPortfolio | ❌ No       | ❌ No  | ❌ No    | ❌ No  | ✅ Yes
Dashboard      | ✅ Yes      | ❌ No  | ❌ No    | ✅ Yes | ❌ No
```

The **StockPortfolio page is the source of truth for detailed holdings** but uses a different calculation method. **AssetOverview uses the correct calculation** that matches Dashboard.

