// components/SellDialog.tsx
"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
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
    return [...cash].sort((a, b) => {
      const aMatch = a.currency === holdingCurrency ? 0 : 1;
      const bMatch = b.currency === holdingCurrency ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [accounts, holdingCurrency]);

  const selectedAccount = sortedAccounts.find((a) => a.id === accountId);

  const qty = parseFloat(quantity);
  const prc = parseFloat(price);
  const isValid = qty > 0 && qty <= currentQuantity && prc > 0 && accountId !== "";
  const isClearAll = Math.abs(qty - currentQuantity) < 1e-9;

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
