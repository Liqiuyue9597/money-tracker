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

  const [amountOrQty, setAmountOrQty] = useState("");
  const [price, setPrice] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSellAll, setIsSellAll] = useState(false);

  const isFund = unitLabel === "份";

  const sortedAccounts = useMemo(() => {
    const cash = accounts.filter((a) => a.type === "cash" || a.type === "brokerage");
    return [...cash].sort((a, b) => {
      const aMatch = a.currency === holdingCurrency ? 0 : 1;
      const bMatch = b.currency === holdingCurrency ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [accounts, holdingCurrency]);

  const selectedAccount = sortedAccounts.find((a) => a.id === accountId);
  const currencyMismatch = selectedAccount && selectedAccount.currency !== holdingCurrency;

  const inputAmount = parseFloat(amountOrQty);
  const prc = parseFloat(price);

  const sellQty = isFund
    ? (inputAmount > 0 && prc > 0 ? inputAmount / prc : NaN)
    : inputAmount;

  const exceedsHolding = isFund
    ? (!isNaN(sellQty) && sellQty > currentQuantity + 1e-9)
    : (!isNaN(inputAmount) && inputAmount > currentQuantity + 1e-9);

  const isValid =
    !isNaN(inputAmount) && inputAmount > 0 &&
    !isNaN(prc) && prc > 0 &&
    accountId !== "" &&
    !isNaN(sellQty) && sellQty > 0 &&
    !exceedsHolding;

  const isClearAll = isValid && isSellAll;

  const remainingQuantity = isValid ? currentQuantity - sellQty : null;
  const receiveAmount = isFund
    ? (isValid ? inputAmount : null)
    : (isValid ? inputAmount * prc : null);
  const newBalance =
    receiveAmount != null && selectedAccount
      ? Number(selectedAccount.balance) + receiveAmount
      : null;

  async function handleConfirm() {
    if (!isValid) {
      toast.error("请填写完整信息");
      return;
    }
    setLoading(true);
    try {
      const roundedQty = isClearAll
        ? currentQuantity
        : isFund ? parseFloat(sellQty.toFixed(4)) : sellQty;
      await onConfirm({ quantity: roundedQty, price: prc, accountId, isClearAll });
      setAmountOrQty("");
      setPrice("");
      setAccountId("");
      setIsSellAll(false);
      onOpenChange(false);
    } catch (err) {
      console.error("SellDialog: onConfirm failed", err);
      // toast is handled by the caller
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setAmountOrQty("");
      setPrice("");
      setAccountId("");
      setIsSellAll(false);
    }
    onOpenChange(newOpen);
  }

  function handleSellAll() {
    if (isFund) {
      if (prc > 0) {
        setAmountOrQty((currentQuantity * prc).toFixed(2));
        setIsSellAll(true);
      } else {
        // NAV not entered yet — show a toast hint
        toast.info("请先填写卖出净值，再点击「全部卖出」");
      }
    } else {
      setAmountOrQty(currentQuantity.toString());
      setIsSellAll(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>卖出 {symbol}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2">
          当前持仓：{currentQuantity}{unitLabel} · 成本 {CURRENCIES[holdingCurrency].symbol}{currentBuyPrice.toFixed(isFund ? 4 : 2)}
        </div>
        <div className="space-y-3">

          {/* Input 1: 卖出金额 (fund) or 卖出数量 (stock) */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {isFund ? "卖出金额" : "卖出数量"}
            </div>
            <Input
              type="number"
              placeholder={isFund ? `金额（${CURRENCIES[holdingCurrency].symbol}）` : `数量（${unitLabel}）`}
              value={amountOrQty}
              onChange={(e) => { setAmountOrQty(e.target.value); setIsSellAll(false); }}
              step={isFund ? "1" : "0.01"}
              className="rounded-xl"
              autoFocus
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                持仓：{currentQuantity.toFixed(isFund ? 4 : 2)}{unitLabel}
                {isFund && !isNaN(sellQty) && sellQty > 0 && (
                  <span className="ml-1 text-foreground">（≈ {sellQty.toFixed(4)} 份）</span>
                )}
              </span>
              <button
                onClick={handleSellAll}
                className="text-xs text-primary underline"
              >
                全部卖出
              </button>
            </div>
          </div>

          {/* Input 2: 净值 (fund) or 单价 (stock) */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {isFund ? "卖出净值" : "卖出单价"}
            </div>
            <Input
              type="number"
              placeholder={`${isFund ? "净值" : "单价"}（${CURRENCIES[holdingCurrency].symbol}）`}
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

          {currencyMismatch && (
            <div className="rounded-xl bg-red-50 border border-red-300 p-2 text-xs text-red-800">
              ⚠️ 币种不匹配：持仓为 {CURRENCIES[holdingCurrency].name}（{holdingCurrency}），账户为 {CURRENCIES[selectedAccount.currency].name}（{selectedAccount.currency}）。收款金额将以 {holdingCurrency} 计算直接入账，不做汇率转换。
            </div>
          )}

          {exceedsHolding && (
            <div className="rounded-xl bg-red-50 border border-red-300 p-2 text-xs text-red-800">
              ⚠️ {isFund ? `卖出金额对应份额（${isNaN(sellQty) ? "—" : sellQty.toFixed(4)} 份）超过当前持仓` : "卖出数量超过当前持仓"}
            </div>
          )}

          {isValid && receiveAmount != null && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs space-y-1">
              <div className="text-muted-foreground mb-1">卖出后预览</div>
              {isFund && (
                <div className="flex justify-between">
                  <span>卖出份额</span>
                  <span className="font-medium">
                    ≈ <strong>{sellQty.toFixed(4)} 份</strong>
                    <span className="text-muted-foreground ml-1">({inputAmount} ÷ {prc})</span>
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>剩余数量</span>
                <span className="font-medium">
                  {currentQuantity.toFixed(isFund ? 4 : 2)} - {sellQty.toFixed(isFund ? 4 : 2)} = <strong>{remainingQuantity!.toFixed(isFund ? 4 : 2)}{unitLabel}</strong>
                </span>
              </div>
              <div className="flex justify-between">
                <span>成本价</span>
                <span className="font-medium">
                  <strong>{CURRENCIES[holdingCurrency].symbol}{currentBuyPrice.toFixed(isFund ? 4 : 2)}</strong>（不变）
                </span>
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
