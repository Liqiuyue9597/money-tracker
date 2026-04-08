# Portfolio Data Calculation Analysis - Complete Documentation

This analysis thoroughly explores how investment portfolio data is calculated and displayed in the money-tracker app, focusing on the discrepancies between different pages.

## 📚 Documentation Files

### 1. **FINDINGS_SUMMARY.md** - START HERE
The executive summary with:
- Clear problem statement
- Root cause identification
- Specific calculation examples
- Impact assessment
- Exact fixes needed

**Read this first for a quick understanding of the issue.**

### 2. **portfolio_analysis.md** - DETAILED DEEP DIVE
Comprehensive technical analysis including:
- Detailed code for each component (AssetOverview, StockPortfolio, Dashboard)
- Crypto portfolio calculation logic
- Data flow from API calls to display
- Currency conversion dependencies
- Manual price handling inconsistencies
- Complete recommendations

**Read this for technical details and comprehensive understanding.**

### 3. **side_by_side_comparison.md** - CODE COMPARISON
Direct code comparison showing:
- Side-by-side code for all three components
- What each component has and is missing
- Data dependency matrix
- Price fallback logic comparison
- Practical mixed-portfolio example

**Read this to understand exactly what's different in the code.**

### 4. **visual_flowchart.txt** - ARCHITECTURE DIAGRAM
ASCII flowcharts showing:
- Complete data flow from sources to display
- Calculation layer comparison
- Display layer output
- Currency conversion example
- Dependency tree

**Read this for visual understanding of the system architecture.**

### 5. **code_locations.txt** - EXACT REFERENCES
Line-by-line reference with:
- Exact file names and line numbers
- What's correct and what's broken
- Critical differences highlighted
- Summary of key locations

**Use this as a reference when fixing the code.**

---

## 🎯 Quick Summary

### The Problem
Three different components display stock portfolio totals:
- **AssetOverview.tsx** (`/assets` page) - ✅ Shows correct value
- **StockPortfolio.tsx** (`/stocks` page) - ❌ Shows WRONG value
- **Dashboard.tsx** (home page) - ✅ Shows correct value

### The Root Cause
**StockPortfolio.tsx doesn't convert currencies before summing** mixed-currency holdings together.

### Real Example
Portfolio with:
- 1 US stock AAPL @ $150
- 1 Chinese fund @ ¥1.50  
- 1 HK stock @ HK$55

**What should be shown (converted to CNY):** ¥1114.75 ✅
**What StockPortfolio shows:** $206.50 ❌

**The discrepancy: 5.4x off!**

---

## 🔍 What's Missing in StockPortfolio

```typescript
// ❌ NOT IMPORTED:
import { useApp } from "@/components/AppProvider";
import { useExchangeRates } from "@/lib/swr-hooks";
import { convertCurrency } from "@/lib/exchange";

// ❌ NOT FETCHED:
const { mainCurrency } = useApp();
const { data: rates } = useExchangeRates(mainCurrency);
const rateMap = rates?.rates || { CNY: 1, USD: 0.137, HKD: 1.07 };

// ❌ NOT APPLIED:
// convertCurrency() not used in calculations
```

---

## ✅ Where to Focus

### Primary Fix Location
**File:** `components/StockPortfolio.tsx`  
**Lines:** 194-222 (calculation loop)  
**Lines:** 355 (display formatting)  

### Change Summary
1. Add 3 imports (useApp, useExchangeRates, convertCurrency)
2. Get mainCurrency and rates
3. Apply convertCurrency() in the calculation loop
4. Change display to use formatMoney() instead of hardcoded $

**Estimated time to fix:** 5-10 minutes

---

## 🧪 Testing Checklist

After implementing fixes:

- [ ] Create a portfolio with mixed currencies (US + HK + CNY holdings)
- [ ] Set mainCurrency to CNY
- [ ] Navigate to `/assets` and verify total value
- [ ] Navigate to `/stocks` and verify same total value
- [ ] Navigate to `/` and verify same total value
- [ ] Change mainCurrency to USD
- [ ] Repeat all three pages - should show same converted value
- [ ] Test with manual prices (set price manually in StockPortfolio)
- [ ] Verify AssetOverview also shows updated manual prices

---

## 📊 Affected Areas

1. **User Experience**
   - Confusion when switching pages
   - Incorrect portfolio tracking
   - Inaccurate net worth calculations

2. **Data Integrity**
   - Portfolio totals don't match across pages
   - P&L calculations may be incorrect
   - Investment decisions based on wrong numbers

3. **Components**
   - AssetOverview: Used for net worth calculation ⚠️
   - StockPortfolio: Shows wrong detailed breakdown ⚠️
   - Dashboard: Shows wrong portfolio summary on home page ⚠️

---

## 🎓 Key Learning Points

1. **Duplication is dangerous** - Same calculation in 3 places leads to inconsistency
2. **Multi-currency portfolios need special handling** - Can't just sum values
3. **Test with realistic data** - This bug is hidden in single-currency portfolios
4. **Dependencies matter** - mainCurrency and rates must be in useMemo deps

---

## 💡 Recommendations

### Immediate
1. Fix StockPortfolio.tsx (see FINDINGS_SUMMARY.md for exact code)
2. Add unit tests for mixed-currency portfolios
3. Test on staging before deploying

### Short Term
1. Standardize manual price handling across all components
2. Create reusable `usePortfolioTotals()` hook to eliminate duplication

### Long Term
1. Consider component extraction for portfolio display
2. Add integration tests for portfolio consistency
3. Document multi-currency handling in code comments

---

## 📖 How to Use This Documentation

1. **For a quick understanding:** Read FINDINGS_SUMMARY.md (5 minutes)
2. **For implementation:** Read code_locations.txt + FINDINGS_SUMMARY.md fix section (10 minutes)
3. **For deep understanding:** Read portfolio_analysis.md (20 minutes)
4. **For visual learners:** Check visual_flowchart.txt (10 minutes)
5. **For code review:** Use side_by_side_comparison.md (15 minutes)

---

## 🔗 File Structure

```
Documentation/
├── README.md                      (this file)
├── FINDINGS_SUMMARY.md           (executive summary + fixes)
├── portfolio_analysis.md         (deep technical analysis)
├── side_by_side_comparison.md    (code comparison)
├── visual_flowchart.txt          (architecture diagrams)
└── code_locations.txt            (line references)

Target Code/
├── components/AssetOverview.tsx  (✅ correct)
├── components/StockPortfolio.tsx (❌ broken)
├── components/Dashboard.tsx      (✅ correct)
├── lib/swr-hooks.ts             (data fetching)
├── lib/exchange.ts              (currency conversion)
└── lib/supabase.ts              (types & constants)
```

---

## 🚀 Implementation Quick Start

To fix the bug immediately:

```typescript
// In components/StockPortfolio.tsx

// 1. Add imports at top (after line 7)
import { useApp } from "@/components/AppProvider";
import { useExchangeRates } from "@/lib/swr-hooks";
import { convertCurrency } from "@/lib/exchange";

// 2. Add after line 31
const { mainCurrency } = useApp();

// 3. Add after line 36
const { data: rates } = useExchangeRates(mainCurrency);
const rateMap = rates?.rates || { CNY: 1, USD: 0.137, HKD: 1.07 };

// 4. Modify calculation (lines 194-212)
// Change from: totals[type as StockAssetType].cost += cost;
// To:
const cur = (h.currency || "USD") as Currency;
const costConverted = convertCurrency(cost, cur, mainCurrency, rateMap);
totals[type as StockAssetType].cost += costConverted;

// And similarly for value

// 5. Fix display (line 355)
// Change from: ${totalValue.toLocaleString(...)}
// To: {formatMoney(totalValue, mainCurrency)}
```

---

## ❓ Questions?

Refer back to the specific documentation file:
- **"Why is this happening?"** → FINDINGS_SUMMARY.md
- **"How does the code work?"** → portfolio_analysis.md
- **"What's the exact difference?"** → side_by_side_comparison.md
- **"Where is the bug?"** → code_locations.txt
- **"How should data flow?"** → visual_flowchart.txt

---

**Analysis completed:** 2026-04-08  
**Status:** Ready for implementation  
**Priority:** High (affects core functionality)

