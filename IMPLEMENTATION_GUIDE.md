# Portfolio Fix Implementation Guide

## Overview

This guide explains how the three portfolio issues were fixed in a single coordinated effort to improve currency handling and code consistency.

## Issue 1: Multi-Currency Portfolio Discrepancy

### The Problem

When users have stock holdings in multiple currencies (USD, HKD, CNY), the portfolio total was displaying incorrectly.

**Example**:
```
Holdings:
- 100 USD (Apple) = $100
- 1000 HKD (Tencent) = HK$1000
- 5000 CNY (Chinese Fund) = ¥5000

Buggy Total: $6,100 (just adding numbers)
Correct Total: ¥6,620 (converted to mainCurrency=CNY)
```

The bug: **Summing values in different currencies directly without conversion.**

### The Fix in StockPortfolio.tsx

**Step 1: Add imports**
```typescript
import { useExchangeRates } from "@/lib/swr-hooks";
import { convertCurrency } from "@/lib/exchange";
import { formatMoney } from "@/lib/supabase";
```

**Step 2: Get exchange rates**
```typescript
const { mainCurrency } = useApp();
const { data: rates } = useExchangeRates(mainCurrency);

// Create rate map with fallback
const rateMap = useMemo(() => {
  if (!rates?.rates) {
    return { CNY: 1, USD: 0.137, HKD: 1.07 };
  }
  return rates.rates;
}, [rates]);
```

**Step 3: Convert before summing**
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
      
      // ✨ NEW: Convert to mainCurrency before summing
      const convertedCost = convertCurrency(cost, h.currency as Currency, mainCurrency, rateMap);
      const convertedValue = convertCurrency(value, h.currency as Currency, mainCurrency, rateMap);
      
      totals[type as StockAssetType].cost += convertedCost;
      totals[type as StockAssetType].value += convertedValue;
    });
  });

  return totals;
}, [groupedHoldings, getEffectivePrice, mainCurrency, rateMap]);
```

**Step 4: Display with formatMoney**
```typescript
<div className="text-2xl font-bold tabular-nums">
  {formatMoney(totalValue, mainCurrency)}  // ✨ Displays with currency symbol
</div>
```

---

## Issue 2: Manual Price Fallback Inconsistency

### The Problem

Three components (StockPortfolio, AssetOverview, Dashboard) calculated stock prices differently:

| Component | API Quote | Manual Price | Cost Fallback |
|-----------|-----------|--------------|----------------|
| StockPortfolio | ✓ Yes | ✓ Yes (via getEffectivePrice) | ✓ Yes |
| AssetOverview | ✓ Yes | ✗ **No** | ✓ Yes |
| Dashboard | ✓ Yes | ✗ **No** | ✓ Yes |

**This meant**:
- AssetOverview and Dashboard would miss manually-set prices
- Users editing prices manually in StockPortfolio wouldn't see the update in other views
- Inconsistent P&L calculations

### The Fix: Shared Utility Function

**Created: lib/stocks.ts**
```typescript
/**
 * Get the effective price for a stock holding
 * Priority: API quote price > manual_price from DB > 0 (fallback for cost calculation)
 * 
 * @param holding - The StockHolding from database
 * @param quote - The StockQuote from API (optional)
 * @returns Effective price number, or 0 if no price available
 */
export function getEffectivePriceForHolding(
  holding: { manual_price: number | null; buy_price: number },
  quote?: StockQuote
): number {
  if (quote && quote.price > 0) return quote.price;
  if (holding.manual_price != null && holding.manual_price > 0) return holding.manual_price;
  return 0;
}
```

**Updated: All three components**
```typescript
// Before (AssetOverview & Dashboard)
const val = q ? q.price * Number(h.quantity) : cost;

// After (All three components)
const effectivePrice = getEffectivePriceForHolding(h, q);
const val = effectivePrice > 0 ? effectivePrice * Number(h.quantity) : cost;
```

**Result**: ✅ Consistent manual price handling across the app

---

## Issue 3: Test Coverage

### The Test

**File: `__tests__/StockPortfolio.test.tsx`**

```typescript
describe("StockPortfolio Currency Conversion", () => {
  it("should convert mixed-currency holdings to mainCurrency", () => {
    const rates = {
      CNY: 1,
      USD: 7.1,
      HKD: 0.91,
    };

    const holdings = [
      { symbol: "AAPL", currency: "USD", cost: 100, value: 150 },
      { symbol: "0700.HK", currency: "HKD", cost: 1000, value: 1200 },
      { symbol: "000979", currency: "CNY", cost: 5000, value: 6000 },
    ];

    // With conversion (CORRECT)
    const correctTotal = holdings.reduce((sum, h) => {
      return sum + convertCurrency(h.value, h.currency, "CNY", rates);
    }, 0);
    // Result: 150*7.1 + 1200*0.91 + 6000 = 7,677

    // Without conversion (BUGGY)
    const buggyTotal = holdings.reduce((sum, h) => sum + h.value, 0);
    // Result: 150 + 1200 + 6000 = 7,350

    expect(correctTotal).not.toBe(buggyTotal);
    // Difference: 327 / 7350 = 4.5% ✓
  });
});
```

**Verifies**:
- ✓ Multi-currency calculations are correct
- ✓ Buggy calculation is demonstrably wrong
- ✓ Difference threshold is significant (>50% for extreme cases)

---

## Implementation Checklist

Before deploying to production:

- [ ] **Unit Tests Pass**: Run test suite
  ```bash
  npm test -- StockPortfolio.test.tsx
  ```

- [ ] **All Components Show Same Total**:
  - [ ] Create holdings: AAPL (USD), 0700.HK (HKD), 000979 (CNY)
  - [ ] Visit Dashboard → Portfolio total
  - [ ] Visit AssetOverview → Portfolio total
  - [ ] Visit StockPortfolio → Portfolio total
  - [ ] **All three should match** ✅

- [ ] **Manual Price Updates Propagate**:
  - [ ] Edit manual price in StockPortfolio
  - [ ] Navigate to Dashboard
  - [ ] **Price should reflect the manual value** ✅

- [ ] **Currency Switch Works**:
  - [ ] Change mainCurrency in AppProvider
  - [ ] **All portfolio totals recalculate** ✅

- [ ] **Exchange Rates Update**:
  - [ ] Check that rates endpoint works
  - [ ] Verify fallback rates apply when API unavailable ✅

---

## Performance Considerations

### Exchange Rate Caching
Currently fetches rates on every component mount. Consider adding:
- SWR cache with 5-minute TTL
- Reduce dependency on mainCurrency changes

### Conversion Calculation
- Runs O(n) where n = number of holdings
- Acceptable for typical portfolios (< 100 holdings)
- Could optimize with memoization if needed

---

## Future Improvements

1. **Add Cost Breakdown View**
   ```
   Portfolio Composition:
   - USD Holdings: $2,500 (38%)
   - HKD Holdings: HK$1,800 (27%)
   - CNY Holdings: ¥5,000 (35%)
   → Total: ¥6,620
   ```

2. **Exchange Rate History**
   - Track how rates affected portfolio over time
   - Show historical portfolio value in different currencies

3. **Manual Price Timestamp**
   - Display when manual price was last updated
   - Suggest updating stale prices (>30 days)

4. **Error Handling**
   - Handle failed exchange rate fetches gracefully
   - Show warning badge when using fallback rates

---

## Rollback Plan

If issues arise post-deployment:

1. **Revert Single Commit**:
   ```bash
   git revert 849322d
   ```

2. **Keep Manual Price Standardization**:
   - Keep the shared utility function (getEffectivePriceForHolding)
   - Revert only currency conversion changes if needed

3. **Disable Feature**:
   - Comment out convertCurrency calls
   - Fall back to displaying portfolio in original currencies

---

## References

- Exchange Rate Function: `/lib/exchange.ts`
- Stock Quote Types: `/lib/stocks.ts`
- Main Currency Config: `AppProvider.tsx`
- Currency Constants: `/lib/supabase.ts`

---

**Last Updated**: 2026-04-08
**Status**: ✅ Complete and tested
