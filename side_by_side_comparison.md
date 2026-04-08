# Side-by-Side Code Comparison

## Stock Portfolio Value Calculation

### ✅ AssetOverview.tsx (CORRECT)
```typescript
const { stockValue, stockCost, stockPnl, stockPnlPct } = useMemo(() => {
  if (!holdings || holdings.length === 0 || !quotes) 
    return { stockValue: 0, stockCost: 0, stockPnl: 0, stockPnlPct: 0 };
  
  let totalVal = 0, totalCost = 0;
  for (const h of holdings) {
    const q = quotes[h.symbol];
    const cur = (h.currency || "USD") as Currency;  // ← Get holding currency
    const cost = Number(h.buy_price) * Number(h.quantity);
    const val = q ? q.price * Number(h.quantity) : cost;
    
    // ✅ KEY: Convert each holding to mainCurrency BEFORE summing
    totalCost += convertCurrency(cost, cur, mainCurrency, rateMap);
    totalVal += convertCurrency(val, cur, mainCurrency, rateMap);
  }
  const pnl = totalVal - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
  return { stockValue: totalVal, stockCost: totalCost, stockPnl: pnl, stockPnlPct: pnlPct };
}, [holdings, quotes, mainCurrency, rateMap]);  // ✅ Depends on mainCurrency and rateMap
```

**Usage in totalNetWorth:**
```typescript
if (stockValue > 0) netWorth += stockValue; // ✅ stockValue already in mainCurrency
```

---

### ❌ StockPortfolio.tsx (BROKEN)
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
      const currentPrice = getEffectivePrice(h.symbol);  // ← Includes manual_price fallback
      const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
      
      // ❌ PROBLEM: No currency conversion - just accumulating mixed currencies
      totals[type as StockAssetType].cost += cost;      // Could be CNY, USD, or HKD
      totals[type as StockAssetType].value += value;    // Could be CNY, USD, or HKD
    });
  });

  return totals;
}, [groupedHoldings, getEffectivePrice]);  // ❌ No mainCurrency, no rateMap

const totalValue = useMemo(() =>
  Object.values(typeTotals).reduce((sum, t) => sum + t.value, 0),
  [typeTotals]
);
// ❌ Summing across: { us: 100, hk: 50, fund: 1.50 } = 151.50
//    But these are different currencies being added together!
```

**Display:**
```typescript
${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
// ❌ Always shows as USD even if user's mainCurrency is CNY or HKD
```

---

### ✅ Dashboard.tsx (CORRECT - IDENTICAL TO AssetOverview)
```typescript
const { stockValue, stockCost, stockPnL } = useMemo(() => {
  if (!holdings || holdings.length === 0 || !quotes) 
    return { stockValue: 0, stockCost: 0, stockPnL: 0 };
  
  let totalVal = 0, totalCost = 0;
  for (const h of holdings) {
    const q = quotes[h.symbol];
    const cur = (h.currency || "USD") as Currency;  // ✅ Get holding currency
    const cost = Number(h.buy_price) * Number(h.quantity);
    const val = q ? q.price * Number(h.quantity) : cost;
    
    // ✅ KEY: Convert each holding to mainCurrency BEFORE summing
    totalCost += convertCurrency(cost, cur, mainCurrency, rateMap);
    totalVal += convertCurrency(val, cur, mainCurrency, rateMap);
  }
  return { stockValue: totalVal, stockCost: totalCost, stockPnL: totalVal - totalCost };
}, [holdings, quotes, mainCurrency, rateMap]);  // ✅ Depends on mainCurrency and rateMap
```

**Display:**
```typescript
{formatMoney(stockValue, mainCurrency)}  // ✅ Respects user's mainCurrency
```

---

## Data Dependencies Comparison

| Component | useApp() | useExchangeRates() | convertCurrency() | Data Correct? |
|-----------|----------|-------------------|------------------|---------------|
| **AssetOverview** | ✅ Yes (gets mainCurrency) | ✅ Yes (fetches for mainCurrency) | ✅ Yes (converts before summing) | ✅ YES |
| **StockPortfolio** | ❌ No | ❌ No | ❌ No | ❌ NO |
| **Dashboard** | ✅ Yes (gets mainCurrency) | ✅ Yes (fetches for mainCurrency) | ✅ Yes (converts before summing) | ✅ YES |

---

## Price Fallback Logic Comparison

### StockPortfolio (Has manual_price fallback):
```typescript
const getEffectivePrice = useCallback((sym: string): number => {
  // Priority 1: API quote
  const quote = quotes[sym];
  if (quote && quote.price > 0) return quote.price;
  
  // Priority 2: Manual price from DB
  const holding = holdings.find((h) => h.symbol === sym);
  if (holding?.manual_price != null && holding.manual_price > 0) 
    return holding.manual_price;
  
  // Priority 3: None
  return 0;
}, [quotes, holdings]);
```

### AssetOverview (NO manual_price fallback):
```typescript
const val = q ? q.price * Number(h.quantity) : cost;
// Priority 1: API quote
// Priority 2: Cost (NOT manual_price from DB!)
```

### Dashboard (NO manual_price fallback - same as AssetOverview):
```typescript
const val = q ? q.price * Number(h.quantity) : cost;
// Priority 1: API quote
// Priority 2: Cost
```

**Inconsistency Example:**
- User manually sets AAPL price to $105 in StockPortfolio
- Database now has: `manual_price: 105`
- **StockPortfolio**: Will show portfolio with AAPL @ $105 ✅
- **AssetOverview**: Will show portfolio with AAPL @ buy_price (might be $100) ❌

---

## Practical Example: Mixed Portfolio

### Setup:
```
Holdings:
- 1 × AAPL @ $100 USD (current market: $150)
- 1 × 000979 @ ¥1.00 CNY (current market: ¥1.50)
- 1 × 0700.HK @ HK$50 (current market: HK$55)

User Settings:
- mainCurrency: CNY
- Exchange Rates: 1 USD = 7 CNY, 1 HKD = 1.15 CNY
```

### AssetOverview Calculation:
```
AAPL:  cost = 100 USD → 700 CNY,  value = 150 USD → 1050 CNY
000979: cost = 1 CNY → 1 CNY,      value = 1.50 CNY → 1.50 CNY
0700:  cost = 50 HKD → 57.50 CNY, value = 55 HKD → 63.25 CNY

Total Cost:  700 + 1 + 57.50 = 758.50 CNY
Total Value: 1050 + 1.50 + 63.25 = 1114.75 CNY
PnL:         1114.75 - 758.50 = 356.25 CNY ✅ CORRECT
```

### StockPortfolio Calculation:
```
US holdings:  cost = 100,      value = 150
Fund holdings: cost = 1,        value = 1.50
HK holdings:  cost = 50,        value = 55

Total Cost:  100 + 1 + 50 = 151
Total Value: 150 + 1.50 + 55 = 206.50

Display: $206.50 ❌ WRONG!
Correct: 206.50 should be converted to CNY = way higher
```

### Dashboard Calculation:
```
AAPL:  cost = 100 USD → 700 CNY,  value = 150 USD → 1050 CNY
000979: cost = 1 CNY → 1 CNY,      value = 1.50 CNY → 1.50 CNY
0700:  cost = 50 HKD → 57.50 CNY, value = 55 HKD → 63.25 CNY

Total Cost:  700 + 1 + 57.50 = 758.50 CNY
Total Value: 1050 + 1.50 + 63.25 = 1114.75 CNY
PnL:         1114.75 - 758.50 = 356.25 CNY ✅ CORRECT (Same as AssetOverview)
```

### Discrepancy:
- **AssetOverview shows:** ¥1114.75
- **StockPortfolio shows:** $206.50 (should be ¥1114.75!)
- **Dashboard shows:** ¥1114.75 ✅

**Users navigating between /assets and /stocks would see completely different numbers!**

---

