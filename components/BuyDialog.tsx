// components/BuyDialog.tsx
"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
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
    return [...cash].sort((a, b) => {
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

          {/* Negative balance warning */}
          {isValid && remainingBalance != null && remainingBalance < 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              ⚠️ 账户余额不足，操作后将为负数
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
