# Portfolio Data Calculation - Key Findings Summary

## 🎯 Problem Statement

The money-tracker app displays investment portfolio totals in **three different locations** with **different calculated values**. Users report seeing different numbers when viewing the same portfolio on different pages.

---

## 📊 The Three Locations

| Page | Component | URL | Shows Stock Total |
|------|-----------|-----|-------------------|
| **Overview** | AssetOverview.tsx | `/assets` | ✅ Correct (converted to mainCurrency) |
| **Detailed** | StockPortfolio.tsx | `/stocks` | ❌ **WRONG** (mixed currencies) |
| **Dashboard** | Dashboard.tsx | `/` | ✅ Correct (converted to mainCurrency) |

---

## 🔍 Root Cause

**StockPortfolio.tsx does not use currency conversion**, causing it to add together holdings in different currencies.

### Missing Components in StockPortfolio:

```typescript
// ❌ StockPortfolio does NOT have:
import { useApp } from "@/components/AppProvider";           // Missing!
import { useExchangeRates } from "@/lib/swr-hooks";        // Missing!
import { convertCurrency } from "@/lib/exchange";           // Missing!

// ✅ AssetOverview and Dashboard DO have these
```

---

## 💥 Specific Calculation Differences

### Example: Mixed Portfolio Holdings

**Setup:**
```
Portfolio:
├─ 1 AAPL @ $100 (USD market value: $150)
├─ 1 Fund 000979 @ ¥1 (CNY market value: ¥1.50)
└─ 1 Stock 0700 @ HK$50 (HKD market value: HK$55)

User mainCurrency: CNY
Exchange rates: 1 USD = 7 CNY, 1 HKD = 1.15 CNY
```

### AssetOverview.tsx Calculation (CORRECT ✅):
```
Step 1: Calculate value for each holding
  AAPL: $150 × 1 share = $150
  Fund: ¥1.50 × 1 share = ¥1.50  
  0700: HK$55 × 1 share = HK$55

Step 2: Convert each to mainCurrency (CNY)
  AAPL: $150 → 150 × 7 = ¥1050
  Fund: ¥1.50 → ¥1.50
  0700: HK$55 → 55 × 1.15 = ¥63.25

Step 3: Sum in common currency
  Total: 1050 + 1.50 + 63.25 = ¥1114.75 ✅

Display: ¥1114.75
```

### StockPortfolio.tsx Calculation (BROKEN ❌):
```
Step 1: Group by asset_type
  US: { AAPL: $150 }
  Fund: { 000979: ¥1.50 }
  HK: { 0700: HK$55 }

Step 2: Sum within each group (NO CONVERSION)
  US total: $150
  Fund total: ¥1.50
  HK total: HK$55

Step 3: Add groups together (MIXING CURRENCIES!)
  Total: 150 + 1.50 + 55 = 206.50 ❌

Display: $206.50 (should be ¥1114.75!)
ERROR: 5.4x off! (1114.75 / 206.50 ≈ 5.4)
```

### Dashboard.tsx Calculation (CORRECT ✅):
```
Same as AssetOverview.tsx
Display: ¥1114.75 ✅
```

---

## 📋 Key Code Differences

### AssetOverview & Dashboard (Lines 52-73)
```typescript
const { stockValue, stockCost, stockPnl, stockPnlPct } = useMemo(() => {
  let totalVal = 0, totalCost = 0;
  for (const h of holdings) {
    const cur = (h.currency || "USD") as Currency;
    const cost = Number(h.buy_price) * Number(h.quantity);
    const val = q ? q.price * Number(h.quantity) : cost;
    
    // ✅ CONVERT BEFORE SUMMING
    totalCost += convertCurrency(cost, cur, mainCurrency, rateMap);
    totalVal += convertCurrency(val, cur, mainCurrency, rateMap);
  }
  const pnl = totalVal - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
  return { stockValue: totalVal, stockCost: totalCost, stockPnl: pnl, stockPnlPct: pnlPct };
}, [holdings, quotes, mainCurrency, rateMap]);
```

### StockPortfolio (Lines 194-222)
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
      
      // ❌ NO CONVERSION - STAYS IN ORIGINAL CURRENCY
      totals[type as StockAssetType].cost += cost;
      totals[type as StockAssetType].value += value;
    });
  });

  return totals;
}, [groupedHoldings, getEffectivePrice]);

// Later...
const totalValue = useMemo(() =>
  Object.values(typeTotals).reduce((sum, t) => sum + t.value, 0),  // ❌ Sums mixed currencies
  [typeTotals]
);
```

---

## 🐛 Secondary Issue: Manual Price Fallback

Another discrepancy exists with manual price handling:

### StockPortfolio (Has manual_price fallback):
```typescript
const getEffectivePrice = useCallback((sym: string): number => {
  const quote = quotes[sym];
  if (quote && quote.price > 0) return quote.price;
  
  // Falls back to manual_price ✅
  const holding = holdings.find((h) => h.symbol === sym);
  if (holding?.manual_price != null && holding.manual_price > 0) 
    return holding.manual_price;
  
  return 0;
}, [quotes, holdings]);
```

### AssetOverview & Dashboard (NO manual_price fallback):
```typescript
const val = q ? q.price * Number(h.quantity) : cost;
// Falls back to cost, NOT manual_price ❌
```

**This means:**
- If user manually sets AAPL price to $105 in DB
- StockPortfolio shows updated value
- AssetOverview shows outdated value
- Another inconsistency!

---

## 📈 Impact Assessment

### When this bug appears:
1. ✅ Single-currency portfolios only (USD, CNY, or HKD alone) - Bug is hidden
2. ❌ Mixed-currency portfolios (US stocks + HK stocks + Chinese funds) - Bug is visible
3. ❌ User has mainCurrency set to non-USD value - Bug magnitude increases

### Severity:
- **High** - Users see wildly different portfolio values (5x off in the example)
- **Affects:** Net worth calculation, investment tracking accuracy
- **User experience:** Confusion when switching between /assets and /stocks pages

---

## 🔧 Components Requiring Fixes

### PRIMARY FIX: StockPortfolio.tsx

**What needs to change:**

1. **Import missing dependencies:**
   ```typescript
   import { useApp } from "@/components/AppProvider";
   import { useExchangeRates } from "@/lib/swr-hooks";
   import { convertCurrency } from "@/lib/exchange";
   ```

2. **Get mainCurrency and rates:**
   ```typescript
   const { mainCurrency } = useApp();
   const { data: rates } = useExchangeRates(mainCurrency);
   const rateMap = rates?.rates || { CNY: 1, USD: 0.137, HKD: 1.07 };
   ```

3. **Apply currency conversion in calculation:**
   ```typescript
   Object.entries(groupedHoldings).forEach(([type, items]) => {
     items.forEach((h) => {
       const cur = (h.currency || "USD") as Currency;  // Add this
       const cost = Number(h.buy_price) * Number(h.quantity);
       const currentPrice = getEffectivePrice(h.symbol);
       const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
       
       // Convert before summing
       const costConverted = convertCurrency(cost, cur, mainCurrency, rateMap);
       const valueConverted = convertCurrency(value, cur, mainCurrency, rateMap);
       
       totals[type as StockAssetType].cost += costConverted;
       totals[type as StockAssetType].value += valueConverted;
     });
   });
   ```

4. **Fix display formatting:**
   ```typescript
   // Change from:
   ${totalValue.toLocaleString("en-US", {...})}
   
   // To:
   {formatMoney(totalValue, mainCurrency)}
   ```

### SECONDARY FIX: Standardize Manual Price Handling

**Either:**
- Add manual_price fallback to AssetOverview and Dashboard
- **OR** Remove manual_price fallback from StockPortfolio

Recommend: Add to AssetOverview and Dashboard to match StockPortfolio's feature.

---

## ✅ Verification Checklist

After fixes, verify:

- [ ] StockPortfolio imports useApp, useExchangeRates, convertCurrency
- [ ] StockPortfolio fetches mainCurrency from AppProvider context
- [ ] StockPortfolio fetches exchange rates for mainCurrency
- [ ] StockPortfolio converts each holding before summing
- [ ] StockPortfolio displays in mainCurrency (not hardcoded $)
- [ ] Manual price fallback is consistent across all three components
- [ ] Test with mixed-currency portfolio (US + HK + Fund)
- [ ] Test with different mainCurrency settings (CNY, USD, HKD)
- [ ] /assets, /stocks, and / show same portfolio values ✅

---

## 📚 File Locations

**Files involved:**
- `components/AssetOverview.tsx` - ✅ Correct
- `components/StockPortfolio.tsx` - ❌ Broken
- `components/Dashboard.tsx` - ✅ Correct
- `lib/swr-hooks.ts` - Data fetching
- `lib/exchange.ts` - Currency conversion logic
- `lib/supabase.ts` - Type definitions

---

## 🎓 Lessons Learned

1. **Avoid duplicating calculation logic** - Three components calculate portfolio values independently
2. **Consider creating a custom hook** - `usePortfolioTotals()` would prevent duplication
3. **Test with realistic data** - Mixed currencies exposed this bug
4. **Dependency tracking** - mainCurrency + rates must be included in useMemo deps

---

## 📝 Recommended Next Steps

1. **Fix StockPortfolio.tsx** immediately (5 min change)
2. **Add unit tests** for mixed-currency portfolios
3. **Refactor** - Extract portfolio calculation into reusable `usePortfolioTotals()` hook
4. **Code review** - Check for similar issues in other components
5. **E2E testing** - Test portfolio consistency across all pages

---

