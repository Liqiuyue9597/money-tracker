# StockPortfolio.tsx Currency Conversion Fix - Implementation Log

## Date
April 8, 2026

## Problem Fixed
StockPortfolio.tsx was summing holdings in different currencies without converting to mainCurrency, causing a ~5x discrepancy in mixed-currency portfolios.

### Example Bug Manifestation
- USD stock: $150
- CNY fund: ¥1.50  
- HKD stock: HK$55
- Exchange rates: 1 USD = 7 CNY, 1 HKD = 1.15 CNY

**Before Fix (WRONG):** 150 + 1.50 + 55 = 206.50 (mixing currencies!)
**After Fix (CORRECT):** ¥1050 + ¥1.50 + ¥63.25 = ¥1114.75 ✅

---

## Changes Made

### 1. Added Missing Imports (Lines 5-8)
```typescript
// Before
import { supabase, type StockHolding, type Currency, type StockAssetType, CURRENCIES } from "@/lib/supabase";
import { useStockHoldings, useStockQuotes } from "@/lib/swr-hooks";

// After
import { supabase, type StockHolding, type Currency, type StockAssetType, CURRENCIES, formatMoney } from "@/lib/supabase";
import { useStockHoldings, useStockQuotes, useExchangeRates } from "@/lib/swr-hooks";
import { convertCurrency } from "@/lib/exchange";
```

### 2. Extract mainCurrency from AppProvider (Line 32)
```typescript
// Before
const { user } = useApp();

// After
const { user, mainCurrency } = useApp();
```

### 3. Fetch Exchange Rates (Lines 38-46)
```typescript
// Added
const { data: rates } = useExchangeRates(mainCurrency);

// Build rate map for convertCurrency
const rateMap = useMemo(() => {
  if (!rates?.rates) {
    return { CNY: 1, USD: 0.137, HKD: 1.07 };
  }
  return rates.rates;
}, [rates]);
```

### 4. Apply Currency Conversion in Calculations (Lines 217-222)
```typescript
// Before
Object.entries(groupedHoldings).forEach(([type, items]) => {
  items.forEach((h) => {
    const cost = Number(h.buy_price) * Number(h.quantity);
    const currentPrice = getEffectivePrice(h.symbol);
    const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
    totals[type as StockAssetType].cost += cost;  // ❌ NO CONVERSION
    totals[type as StockAssetType].value += value; // ❌ NO CONVERSION
  });
});

// After
Object.entries(groupedHoldings).forEach(([type, items]) => {
  items.forEach((h) => {
    const cur = (h.currency || "USD") as Currency;
    const cost = Number(h.buy_price) * Number(h.quantity);
    const currentPrice = getEffectivePrice(h.symbol);
    const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
    
    // ✅ Convert to mainCurrency before summing
    const convertedCost = convertCurrency(cost, cur, mainCurrency, rateMap);
    const convertedValue = convertCurrency(value, cur, mainCurrency, rateMap);
    
    totals[type as StockAssetType].cost += convertedCost;
    totals[type as StockAssetType].value += convertedValue;
  });
});
```

### 5. Fixed Dependency Array (Line 227)
```typescript
// Before
}, [groupedHoldings, getEffectivePrice]);  // ❌ Missing mainCurrency, rates

// After
}, [groupedHoldings, getEffectivePrice, mainCurrency, rateMap]);  // ✅ Complete
```

### 6. Updated Display to Use formatMoney (Lines 370, 373, 379, 419, 422)
```typescript
// Before
${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}  // ❌ Hardcoded $

// After
{formatMoney(totalValue, mainCurrency)}  // ✅ Uses mainCurrency
```

---

## Alignment with Other Components

### Now Matches AssetOverview.tsx & Dashboard.tsx:
1. ✅ Imports useApp, useExchangeRates, convertCurrency, formatMoney
2. ✅ Extracts mainCurrency from AppProvider
3. ✅ Fetches exchange rates for mainCurrency
4. ✅ Creates rateMap with proper fallback defaults
5. ✅ Applies convertCurrency() to each holding BEFORE summing
6. ✅ Includes mainCurrency and rateMap in dependency arrays
7. ✅ Displays using formatMoney(value, mainCurrency)

---

## Testing Checklist

- [x] TypeScript compilation (all imports correct)
- [x] All formatMoney calls use mainCurrency
- [x] Currency conversion applied before summing in typeTotals
- [x] Dependency arrays include mainCurrency and rateMap
- [x] Exchange rates fallback properly when API fails
- [ ] Manual testing with mixed-currency portfolio
- [ ] Verify /assets, /stocks, and / show same totals
- [ ] Test with different mainCurrency settings (CNY, USD, HKD)

---

## Notes

- The fix addresses the PRIMARY ISSUE: missing currency conversion
- SECONDARY ISSUE (manual_price fallback inconsistency) remains unaddressed - see task #4
- Individual holdings still display in their original currency (correct per-line behavior)
- Only the portfolio TOTAL is now in mainCurrency
- The calculation layer (typeTotals) now converts before summing
- The display layer now respects mainCurrency

---

## Files Modified
- `components/StockPortfolio.tsx` - Added 3 imports, 1 hook call, currency conversion logic, updated display

## Related Files (unchanged but similar)
- `components/AssetOverview.tsx` - Reference implementation (has all fixes)
- `components/Dashboard.tsx` - Reference implementation (has all fixes)
- `lib/exchange.ts` - convertCurrency() function
- `lib/swr-hooks.ts` - useExchangeRates() hook

