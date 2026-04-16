# Stock/Crypto Buy/Sell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add buy (加仓) and sell (减仓) functionality to stock/fund holdings in StockPortfolio and crypto holdings in AssetOverview, with automatic cost averaging and linked cash account balance updates.

**Architecture:** Extract shared BuyDialog and SellDialog components to `components/` that accept generic holding data and a table name. Modify StockPortfolio card rendering to use expandable cards with an action bar. Apply the same expand pattern to crypto cards in AssetOverview. Both components pass `accounts` from AppProvider for the account selector.

**Tech Stack:** Next.js + TypeScript + Tailwind CSS + shadcn/ui (Dialog, Input, Button, Badge) + Supabase client

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `components/BuyDialog.tsx` | Create | Shared buy dialog — quantity, price, account selector, cost preview, submit |
| `components/SellDialog.tsx` | Create | Shared sell dialog — quantity, price, account selector, preview, full-sell shortcut |
| `components/StockPortfolio.tsx` | Modify | Add expandable cards, wire buy/sell dialogs, move edit/delete into expand area |
| `components/AssetOverview.tsx` | Modify | Add expandable crypto cards, wire buy/sell dialogs, remove inline delete button |

---

### Task 1: Create BuyDialog component

**Files:**
- Create: `components/BuyDialog.tsx`

- [ ] **Step 1: Create the BuyDialog component file**

This is a generic buy dialog that works for both stocks and crypto. It receives the current holding data and an `onConfirm` callback.

```tsx
// components/BuyDialog.tsx
"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { type Account, type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BuyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Symbol to display in title, e.g. "AAPL" or "BTC" */
  symbol: string;
  /** Current quantity held */
  currentQuantity: number;
  /** Current cost basis per unit */
  currentBuyPrice: number;
  /** Currency of this holding (e.g. "USD", "CNY", "HKD") */
  holdingCurrency: Currency;
  /** Unit label: "股" for stocks, "份" for funds, or a custom string for crypto */
  unitLabel: string;
  /** Called on confirm with { quantity, price, accountId }. Should return a promise that resolves on success. */
  onConfirm: (data: { quantity: number; price: number; accountId: string }) => Promise<void>;
}

export function BuyDialog({
  open,
  onOpenChange,
  symbol,
  currentQuantity,
  currentBuyPrice,
  holdingCurrency,
  unitLabel,
  onConfirm,
}: BuyDialogProps) {
  const { accounts } = useApp();
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);

  // Sort accounts: same currency first
  const sortedAccounts = useMemo(() => {
    const cash = accounts.filter((a) => a.type === "cash");
    return cash.sort((a, b) => {
      const aMatch = a.currency === holdingCurrency ? 0 : 1;
      const bMatch = b.currency === holdingCurrency ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [accounts, holdingCurrency]);

  const selectedAccount = sortedAccounts.find((a) => a.id === accountId);

  const qty = parseFloat(quantity);
  const prc = parseFloat(price);
  const isValid = qty > 0 && prc > 0 && accountId !== "";

  // Preview calculations
  const newQuantity = isValid ? currentQuantity + qty : null;
  const newAvgCost = isValid && newQuantity
    ? (currentQuantity * currentBuyPrice + qty * prc) / newQuantity
    : null;
  const deductAmount = isValid ? qty * prc : null;
  const remainingBalance = isValid && selectedAccount
    ? Number(selectedAccount.balance) - (deductAmount ?? 0)
    : null;

  async function handleConfirm() {
    if (!isValid) {
      toast.error("请填写完整信息");
      return;
    }
    setLoading(true);
    try {
      await onConfirm({ quantity: qty, price: prc, accountId });
      // Reset form on success
      setQuantity("");
      setPrice("");
      setAccountId("");
      onOpenChange(false);
    } catch {
      // onConfirm should handle its own toast.error
    } finally {
      setLoading(false);
    }
  }

  // Reset form when dialog opens
  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setQuantity("");
      setPrice("");
      setAccountId("");
    }
    onOpenChange(newOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>买入 {symbol}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          当前持仓：{currentQuantity}{unitLabel} · 成本 {CURRENCIES[holdingCurrency].symbol}{currentBuyPrice.toFixed(2)}
        </div>
        <div className="space-y-3">
          {/* Quantity */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">买入数量</div>
            <Input
              type="number"
              placeholder={`数量（${unitLabel}）`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              step="0.01"
              className="rounded-xl"
              autoFocus
            />
          </div>

          {/* Price */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">买入单价</div>
            <Input
              type="number"
              placeholder={`单价（${CURRENCIES[holdingCurrency].symbol}）`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              step="0.0001"
              className="rounded-xl"
            />
          </div>

          {/* Account selector */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">扣款账户</div>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">选择账户</option>
              {sortedAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.icon} {acc.name} ({formatMoney(Number(acc.balance), acc.currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          {isValid && newQuantity != null && newAvgCost != null && deductAmount != null && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1">
              <div className="text-muted-foreground mb-1">买入后预览</div>
              <div className="flex justify-between">
                <span>总数量</span>
                <span className="font-medium">{currentQuantity} + {qty} = <strong>{newQuantity}{unitLabel}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>加权平均成本</span>
                <span className="font-medium"><strong>{CURRENCIES[holdingCurrency].symbol}{newAvgCost.toFixed(2)}</strong></span>
              </div>
              <div className="border-t border-dashed border-emerald-300 my-1" />
              <div className="flex justify-between">
                <span>扣款金额</span>
                <span className="font-semibold text-red-600">-{formatMoney(deductAmount, holdingCurrency)}</span>
              </div>
              {remainingBalance != null && selectedAccount && (
                <div className="flex justify-between">
                  <span>账户剩余</span>
                  <span className="font-medium">{formatMoney(remainingBalance, selectedAccount.currency)}</span>
                </div>
              )}
              <div className="text-muted-foreground mt-1">💡 确认后可手动修改成本价</div>
            </div>
          )}

          <Button onClick={handleConfirm} disabled={loading || !isValid} className="w-full rounded-xl">
            {loading ? "处理中..." : "确认买入"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors related to BuyDialog.tsx

- [ ] **Step 3: Commit**

```bash
git add components/BuyDialog.tsx
git commit -m "feat: add BuyDialog shared component for stock/crypto buy operations"
```

---

### Task 2: Create SellDialog component

**Files:**
- Create: `components/SellDialog.tsx`

- [ ] **Step 1: Create the SellDialog component file**

```tsx
// components/SellDialog.tsx
"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { type Account, type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  currentQuantity: number;
  currentBuyPrice: number;
  holdingCurrency: Currency;
  unitLabel: string;
  /** Called on confirm. Should return a promise that resolves on success. */
  onConfirm: (data: { quantity: number; price: number; accountId: string; isClearAll: boolean }) => Promise<void>;
}

export function SellDialog({
  open,
  onOpenChange,
  symbol,
  currentQuantity,
  currentBuyPrice,
  holdingCurrency,
  unitLabel,
  onConfirm,
}: SellDialogProps) {
  const { accounts } = useApp();
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);

  const sortedAccounts = useMemo(() => {
    const cash = accounts.filter((a) => a.type === "cash");
    return cash.sort((a, b) => {
      const aMatch = a.currency === holdingCurrency ? 0 : 1;
      const bMatch = b.currency === holdingCurrency ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [accounts, holdingCurrency]);

  const selectedAccount = sortedAccounts.find((a) => a.id === accountId);

  const qty = parseFloat(quantity);
  const prc = parseFloat(price);
  const isValid = qty > 0 && qty <= currentQuantity && prc > 0 && accountId !== "";
  const isClearAll = qty === currentQuantity;

  // Preview
  const remainingQuantity = isValid ? currentQuantity - qty : null;
  const receiveAmount = isValid ? qty * prc : null;
  const newBalance = isValid && selectedAccount
    ? Number(selectedAccount.balance) + (receiveAmount ?? 0)
    : null;

  async function handleConfirm() {
    if (!isValid) {
      toast.error("请填写完整信息");
      return;
    }
    if (qty > currentQuantity) {
      toast.error(`卖出数量不能超过持仓数量 (${currentQuantity})`);
      return;
    }
    setLoading(true);
    try {
      await onConfirm({ quantity: qty, price: prc, accountId, isClearAll });
      setQuantity("");
      setPrice("");
      setAccountId("");
      onOpenChange(false);
    } catch {
      // onConfirm should handle its own toast.error
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setQuantity("");
      setPrice("");
      setAccountId("");
    }
    onOpenChange(newOpen);
  }

  function handleSellAll() {
    setQuantity(currentQuantity.toString());
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>卖出 {symbol}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          当前持仓：{currentQuantity}{unitLabel} · 成本 {CURRENCIES[holdingCurrency].symbol}{currentBuyPrice.toFixed(2)}
        </div>
        <div className="space-y-3">
          {/* Quantity */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">卖出数量</div>
            <Input
              type="number"
              placeholder={`数量（${unitLabel}）`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              step="0.01"
              className="rounded-xl"
              autoFocus
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">可卖：{currentQuantity}{unitLabel}</span>
              <button
                onClick={handleSellAll}
                className="text-xs text-primary underline"
              >
                全部卖出
              </button>
            </div>
          </div>

          {/* Price */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">卖出单价</div>
            <Input
              type="number"
              placeholder={`单价（${CURRENCIES[holdingCurrency].symbol}）`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              step="0.0001"
              className="rounded-xl"
            />
          </div>

          {/* Account selector */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">收款账户</div>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">选择账户</option>
              {sortedAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.icon} {acc.name} ({formatMoney(Number(acc.balance), acc.currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          {isValid && receiveAmount != null && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs space-y-1">
              <div className="text-muted-foreground mb-1">卖出后预览</div>
              <div className="flex justify-between">
                <span>剩余数量</span>
                <span className="font-medium">
                  {currentQuantity} - {qty} = <strong>{remainingQuantity}{unitLabel}</strong>
                </span>
              </div>
              <div className="flex justify-between">
                <span>成本价</span>
                <span className="font-medium"><strong>{CURRENCIES[holdingCurrency].symbol}{currentBuyPrice.toFixed(2)}</strong>（不变）</span>
              </div>
              <div className="border-t border-dashed border-red-300 my-1" />
              <div className="flex justify-between">
                <span>收款金额</span>
                <span className="font-semibold text-emerald-600">+{formatMoney(receiveAmount, holdingCurrency)}</span>
              </div>
              {newBalance != null && selectedAccount && (
                <div className="flex justify-between">
                  <span>账户更新后余额</span>
                  <span className="font-medium">{formatMoney(newBalance, selectedAccount.currency)}</span>
                </div>
              )}
            </div>
          )}

          {/* Clear all warning */}
          {isValid && isClearAll && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              ⚠️ 全部卖出后将自动删除该持仓记录，收款到选定账户
            </div>
          )}

          <Button onClick={handleConfirm} disabled={loading || !isValid} className="w-full rounded-xl">
            {loading ? "处理中..." : "确认卖出"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors related to SellDialog.tsx

- [ ] **Step 3: Commit**

```bash
git add components/SellDialog.tsx
git commit -m "feat: add SellDialog shared component for stock/crypto sell operations"
```

---

### Task 3: Add expandable cards and buy/sell to StockPortfolio

**Files:**
- Modify: `components/StockPortfolio.tsx`

This task modifies the stock holding cards to be expandable (accordion style) and wires up BuyDialog/SellDialog. The edit/delete buttons move from the card header into the expanded action bar.

- [ ] **Step 1: Add imports and new state variables**

Add to the top imports in StockPortfolio.tsx:

```tsx
// Add to existing imports
import { BuyDialog } from "@/components/BuyDialog";
import { SellDialog } from "@/components/SellDialog";
```

And in the component, add to existing imports from `useApp`:

Change:
```tsx
const { user, mainCurrency } = useApp();
```
To:
```tsx
const { user, mainCurrency, accounts, refreshAccounts } = useApp();
```

Add new state variables after the existing `adding` state (line 62):

```tsx
// Expandable card state
const [expandedId, setExpandedId] = useState<string | null>(null);

// Buy/Sell dialog state
const [buyHolding, setBuyHolding] = useState<StockHolding | null>(null);
const [sellHolding, setSellHolding] = useState<StockHolding | null>(null);
```

- [ ] **Step 2: Add handleBuy and handleSell functions**

Add these after `handleManualPriceSave` (after line 165):

```tsx
async function handleBuy(holdingId: string, data: { quantity: number; price: number; accountId: string }) {
  const holding = holdings.find((h) => h.id === holdingId);
  if (!holding) return;

  const oldQty = Number(holding.quantity);
  const oldPrice = Number(holding.buy_price);
  const newQty = oldQty + data.quantity;
  const newAvgCost = (oldQty * oldPrice + data.quantity * data.price) / newQty;

  try {
    // Update holding
    const { error: holdingError } = await supabase
      .from("stock_holdings")
      .update({ quantity: newQty, buy_price: newAvgCost })
      .eq("id", holdingId);

    if (holdingError) {
      toast.error("买入失败: " + holdingError.message);
      throw holdingError;
    }

    // Update account balance
    const account = accounts.find((a) => a.id === data.accountId);
    if (account) {
      const deductAmount = data.quantity * data.price;
      const newBalance = Number(account.balance) - deductAmount;
      const { error: accountError } = await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", data.accountId);

      if (accountError) {
        toast.error("账户余额更新失败: " + accountError.message);
        // Note: holding already updated, but we still throw to signal failure
        throw accountError;
      }
    }

    toast.success(`已买入 ${data.quantity} ${holding.symbol}`);
    mutateHoldings();
    refreshAccounts();
  } catch (err) {
    console.error("Buy failed:", err);
    throw err; // Re-throw so BuyDialog knows it failed
  }
}

async function handleSell(holdingId: string, data: { quantity: number; price: number; accountId: string; isClearAll: boolean }) {
  try {
    if (data.isClearAll) {
      // Delete holding
      const { error: holdingError } = await supabase
        .from("stock_holdings")
        .delete()
        .eq("id", holdingId);

      if (holdingError) {
        toast.error("卖出失败: " + holdingError.message);
        throw holdingError;
      }
    } else {
      // Update quantity
      const holding = holdings.find((h) => h.id === holdingId);
      if (!holding) return;
      const newQty = Number(holding.quantity) - data.quantity;
      const { error: holdingError } = await supabase
        .from("stock_holdings")
        .update({ quantity: newQty })
        .eq("id", holdingId);

      if (holdingError) {
        toast.error("卖出失败: " + holdingError.message);
        throw holdingError;
      }
    }

    // Update account balance
    const account = accounts.find((a) => a.id === data.accountId);
    if (account) {
      const receiveAmount = data.quantity * data.price;
      const newBalance = Number(account.balance) + receiveAmount;
      const { error: accountError } = await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", data.accountId);

      if (accountError) {
        toast.error("账户余额更新失败: " + accountError.message);
        throw accountError;
      }
    }

    const holding = holdings.find((h) => h.id === holdingId);
    toast.success(`已卖出 ${data.quantity} ${holding?.symbol ?? ""}`);
    setExpandedId(null);
    mutateHoldings();
    refreshAccounts();
  } catch (err) {
    console.error("Sell failed:", err);
    throw err;
  }
}
```

- [ ] **Step 3: Modify card JSX to be expandable with action bar**

Replace the card rendering section. Find the existing card (lines 442-509):

```tsx
                    <Card key={h.id} className="border-0 shadow-sm overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
```

Replace the entire `<Card key={h.id} ...>` through its closing `</Card>` (lines 442-508) with:

```tsx
                    <Card
                      key={h.id}
                      className={`border-0 shadow-sm overflow-hidden transition-all ${
                        expandedId === h.id ? "ring-1 ring-primary/20" : ""
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Clickable card header */}
                        <div
                          className="flex items-start justify-between cursor-pointer"
                          onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{h.symbol}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {h.currency}
                              </Badge>
                              {isManual && (
                                <Badge variant="outline" className="text-[10px] px-1.5 text-amber-600 border-amber-300">
                                  手动
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {quote?.name || h.name || h.symbol}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                              {Number(h.quantity)} {isFund ? "份" : "股"} × {CURRENCIES[h.currency].symbol}{Number(h.buy_price).toFixed(isFund ? 4 : 2)}
                            </div>
                          </div>
                          <div className="text-right">
                            {currentPrice > 0 ? (
                              <>
                                <div className="font-bold tabular-nums text-sm">
                                  {formatMoney(convertedValue, mainCurrency)}
                                </div>
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  单价 {CURRENCIES[h.currency].symbol}{currentPrice.toFixed(isFund ? 4 : 2)}
                                </div>
                                <div
                                  className={`text-xs font-semibold tabular-nums ${
                                    individualPnL >= 0 ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {individualPnL >= 0 ? "+" : ""}{formatMoney(individualPnL, mainCurrency)} ({individualPnLPct >= 0 ? "+" : ""}{individualPnLPct.toFixed(2)}%)
                                </div>
                              </>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditDialog(h.symbol, 0); }}
                                className="text-xs text-primary hover:underline"
                              >
                                手动输入价格
                              </button>
                            )}
                          </div>
                          <span className={`ml-2 text-muted-foreground transition-transform ${expandedId === h.id ? "rotate-90" : ""}`}>
                            ›
                          </span>
                        </div>

                        {/* Expanded action bar */}
                        {expandedId === h.id && (
                          <div className="border-t mt-3 pt-3 flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 rounded-xl text-xs"
                              onClick={() => setBuyHolding(h)}
                            >
                              📈 买入
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 rounded-xl text-xs"
                              onClick={() => setSellHolding(h)}
                            >
                              📉 卖出
                            </Button>
                            <button
                              onClick={() => openEditDialog(h.symbol, currentPrice)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="手动更新价格"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(h.id)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
```

- [ ] **Step 4: Add BuyDialog and SellDialog instances before the closing `</div>` of the component**

Add just before the final `</div>` of the return (before the Manual Price Edit Dialog):

```tsx
      {/* Buy Dialog */}
      {buyHolding && (
        <BuyDialog
          open={!!buyHolding}
          onOpenChange={(open) => { if (!open) setBuyHolding(null); }}
          symbol={buyHolding.symbol}
          currentQuantity={Number(buyHolding.quantity)}
          currentBuyPrice={Number(buyHolding.buy_price)}
          holdingCurrency={buyHolding.currency as Currency}
          unitLabel={buyHolding.asset_type === "fund" ? "份" : "股"}
          onConfirm={(data) => handleBuy(buyHolding.id, data)}
        />
      )}

      {/* Sell Dialog */}
      {sellHolding && (
        <SellDialog
          open={!!sellHolding}
          onOpenChange={(open) => { if (!open) setSellHolding(null); }}
          symbol={sellHolding.symbol}
          currentQuantity={Number(sellHolding.quantity)}
          currentBuyPrice={Number(sellHolding.buy_price)}
          holdingCurrency={sellHolding.currency as Currency}
          unitLabel={sellHolding.asset_type === "fund" ? "份" : "股"}
          onConfirm={(data) => handleSell(sellHolding.id, data)}
        />
      )}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 6: Manual test in browser**

Run: `cd /Users/elissali/github/money-tracker && npm run dev`

Test:
1. Navigate to `/stocks`
2. Click a holding card → should expand showing buy/sell/edit/delete buttons
3. Click another card → first should collapse (accordion)
4. Click "买入" → BuyDialog opens with correct data
5. Fill in quantity + price + select account → preview should update live
6. Click "卖出" → SellDialog opens with correct data
7. Click "全部卖出" → should fill quantity and show warning

- [ ] **Step 7: Commit**

```bash
git add components/StockPortfolio.tsx
git commit -m "feat: add expandable cards with buy/sell to StockPortfolio"
```

---

### Task 4: Add expandable cards and buy/sell to AssetOverview (crypto)

**Files:**
- Modify: `components/AssetOverview.tsx`

- [ ] **Step 1: Add imports and state**

Add to the top imports:

```tsx
import { BuyDialog } from "@/components/BuyDialog";
import { SellDialog } from "@/components/SellDialog";
```

Add new state variables after the existing `addingCrypto` state (after line 49):

```tsx
// Expandable crypto card state
const [expandedCryptoId, setExpandedCryptoId] = useState<string | null>(null);
const [cryptoBuyHolding, setCryptoBuyHolding] = useState<CryptoHolding | null>(null);
const [cryptoSellHolding, setCryptoSellHolding] = useState<CryptoHolding | null>(null);
```

- [ ] **Step 2: Add handleBuyCrypto and handleSellCrypto functions**

Add after `handleDeleteCrypto` (after line 159):

```tsx
async function handleBuyCrypto(holdingId: string, data: { quantity: number; price: number; accountId: string }) {
  const holding = (cryptoHoldings ?? []).find((h) => h.id === holdingId);
  if (!holding) return;

  const oldQty = Number(holding.quantity);
  const oldPrice = Number(holding.buy_price);
  const newQty = oldQty + data.quantity;
  const newAvgCost = (oldQty * oldPrice + data.quantity * data.price) / newQty;

  try {
    const { error: holdingError } = await supabase
      .from("crypto_holdings")
      .update({ quantity: newQty, buy_price: newAvgCost })
      .eq("id", holdingId);

    if (holdingError) {
      toast.error("买入失败: " + holdingError.message);
      throw holdingError;
    }

    const account = accounts.find((a) => a.id === data.accountId);
    if (account) {
      const deductAmount = data.quantity * data.price;
      const newBalance = Number(account.balance) - deductAmount;
      const { error: accountError } = await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", data.accountId);

      if (accountError) {
        toast.error("账户余额更新失败: " + accountError.message);
        throw accountError;
      }
    }

    toast.success(`已买入 ${data.quantity} ${holding.symbol}`);
    mutateCrypto();
    refreshAccounts();
  } catch (err) {
    console.error("Crypto buy failed:", err);
    throw err;
  }
}

async function handleSellCrypto(holdingId: string, data: { quantity: number; price: number; accountId: string; isClearAll: boolean }) {
  try {
    if (data.isClearAll) {
      const { error: holdingError } = await supabase
        .from("crypto_holdings")
        .delete()
        .eq("id", holdingId);

      if (holdingError) {
        toast.error("卖出失败: " + holdingError.message);
        throw holdingError;
      }
    } else {
      const holding = (cryptoHoldings ?? []).find((h) => h.id === holdingId);
      if (!holding) return;
      const newQty = Number(holding.quantity) - data.quantity;
      const { error: holdingError } = await supabase
        .from("crypto_holdings")
        .update({ quantity: newQty })
        .eq("id", holdingId);

      if (holdingError) {
        toast.error("卖出失败: " + holdingError.message);
        throw holdingError;
      }
    }

    const account = accounts.find((a) => a.id === data.accountId);
    if (account) {
      const receiveAmount = data.quantity * data.price;
      const newBalance = Number(account.balance) + receiveAmount;
      const { error: accountError } = await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", data.accountId);

      if (accountError) {
        toast.error("账户余额更新失败: " + accountError.message);
        throw accountError;
      }
    }

    const holding = (cryptoHoldings ?? []).find((h) => h.id === holdingId);
    toast.success(`已卖出 ${data.quantity} ${holding?.symbol ?? ""}`);
    setExpandedCryptoId(null);
    mutateCrypto();
    refreshAccounts();
  } catch (err) {
    console.error("Crypto sell failed:", err);
    throw err;
  }
}
```

- [ ] **Step 3: Modify crypto card JSX to be expandable**

Replace the existing crypto holding row (lines 372-399). Find:

```tsx
                    <div key={h.id} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}>
```

Replace the entire `<div key={h.id} ...>` through its closing `</div>` with:

```tsx
                    <div key={h.id} className={`${i > 0 ? "border-t" : ""}`}>
                      <div
                        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors ${
                          expandedCryptoId === h.id ? "bg-muted/30" : ""
                        }`}
                        onClick={() => setExpandedCryptoId(expandedCryptoId === h.id ? null : h.id)}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold text-lg">
                          {info?.icon || h.symbol.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm">{h.symbol}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5">{Number(h.quantity).toFixed(4)}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{info?.name || h.name}</div>
                        </div>
                        <div className="text-right">
                          {price > 0 ? (
                            <>
                              <div className="font-semibold tabular-nums text-sm">${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div className={`text-xs tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-muted-foreground">加载中</div>
                          )}
                        </div>
                        <span className={`text-muted-foreground transition-transform ${expandedCryptoId === h.id ? "rotate-90" : ""}`}>
                          ›
                        </span>
                      </div>
                      {/* Expanded action bar */}
                      {expandedCryptoId === h.id && (
                        <div className="border-t px-4 py-3 flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 rounded-xl text-xs"
                            onClick={() => setCryptoBuyHolding(h)}
                          >
                            📈 买入
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-xl text-xs"
                            onClick={() => setCryptoSellHolding(h)}
                          >
                            📉 卖出
                          </Button>
                          <button
                            onClick={() => handleDeleteCrypto(h.id)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
```

- [ ] **Step 4: Add BuyDialog and SellDialog instances**

Add just before the `<AccountManager>` component (before line 458):

```tsx
      {/* Crypto Buy Dialog */}
      {cryptoBuyHolding && (
        <BuyDialog
          open={!!cryptoBuyHolding}
          onOpenChange={(open) => { if (!open) setCryptoBuyHolding(null); }}
          symbol={cryptoBuyHolding.symbol}
          currentQuantity={Number(cryptoBuyHolding.quantity)}
          currentBuyPrice={Number(cryptoBuyHolding.buy_price)}
          holdingCurrency="USD"
          unitLabel=""
          onConfirm={(data) => handleBuyCrypto(cryptoBuyHolding.id, data)}
        />
      )}

      {/* Crypto Sell Dialog */}
      {cryptoSellHolding && (
        <SellDialog
          open={!!cryptoSellHolding}
          onOpenChange={(open) => { if (!open) setCryptoSellHolding(null); }}
          symbol={cryptoSellHolding.symbol}
          currentQuantity={Number(cryptoSellHolding.quantity)}
          currentBuyPrice={Number(cryptoSellHolding.buy_price)}
          holdingCurrency="USD"
          unitLabel=""
          onConfirm={(data) => handleSellCrypto(cryptoSellHolding.id, data)}
        />
      )}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors

- [ ] **Step 6: Manual test in browser**

Test:
1. Navigate to `/assets`
2. In the crypto section, click a crypto holding → should expand with buy/sell/delete
3. Click "买入" → BuyDialog opens with USD currency, correct holding data
4. Click "卖出" → SellDialog opens, "全部卖出" works
5. Verify the existing "添加" button for new crypto still works

- [ ] **Step 7: Commit**

```bash
git add components/AssetOverview.tsx
git commit -m "feat: add expandable cards with buy/sell to crypto holdings in AssetOverview"
```

---

### Task 5: Build verification and final cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full build**

Run: `cd /Users/elissali/github/money-tracker && npm run build 2>&1 | tail -20`

Expected: Build succeeds with no errors

- [ ] **Step 2: End-to-end functional test**

Test the complete flow in browser:

**Stock buy test:**
1. Go to `/stocks` → click a stock card → click "买入"
2. Enter quantity=10, price=100, select an account
3. Verify preview shows correct weighted average cost and deduction
4. Click confirm → toast success
5. Verify card shows updated quantity and cost
6. Verify the selected account balance decreased

**Stock sell test:**
1. Click same stock card → click "卖出"
2. Enter quantity=5, price=120, select account
3. Verify preview is correct
4. Confirm → verify quantity decreased, account balance increased

**Stock sell-all test:**
1. Click "卖出" → click "全部卖出" → select account → confirm
2. Verify holding is deleted from the list

**Crypto buy/sell test:**
1. Go to `/assets` → repeat same tests for crypto holdings
2. Verify USD is the currency shown in dialogs

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```
