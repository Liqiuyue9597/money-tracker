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
  onConfirm: (data: { quantity: number; price: number; accountId: string; deductAmountOverride?: number }) => Promise<void>;
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

  // For funds: "amount" = 投入金额, "price" = 净值
  // For stocks/crypto: "quantity" = 数量, "price" = 单价
  const [amountOrQty, setAmountOrQty] = useState("");
  const [price, setPrice] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [actualDeductInput, setActualDeductInput] = useState("");

  const isFund = unitLabel === "份";

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
  const currencyMismatch = selectedAccount && selectedAccount.currency !== holdingCurrency;

  const inputAmount = parseFloat(amountOrQty); // 投入金额 (fund) 或 数量 (stock)
  const prc = parseFloat(price);               // 净值 (fund) 或 单价 (stock)

  // Derived values
  const buyQty = isFund
    ? (inputAmount > 0 && prc > 0 ? inputAmount / prc : NaN)
    : inputAmount; // for stocks, amountOrQty IS the quantity

  const isValid =
    !isNaN(inputAmount) && inputAmount > 0 &&
    !isNaN(prc) && prc > 0 &&
    accountId !== "" &&
    !isNaN(buyQty) && buyQty > 0;

  const newQuantity = isValid ? currentQuantity + buyQty : null;
  const newAvgCost = isValid && newQuantity
    ? (currentQuantity * currentBuyPrice + buyQty * prc) / newQuantity
    : null;
  const deductAmount = (() => {
    if (!isValid) return null;
    const parsedActualDeduct = parseFloat(actualDeductInput);
    if (currencyMismatch && !isNaN(parsedActualDeduct) && parsedActualDeduct > 0) {
      return parsedActualDeduct;
    }
    return isFund ? inputAmount : inputAmount * prc;
  })();
  const remainingBalance =
    deductAmount != null && selectedAccount
      ? Number(selectedAccount.balance) - deductAmount
      : null;

  async function handleConfirm() {
    if (!isValid) {
      toast.error("请填写完整信息");
      return;
    }
    if (currencyMismatch && actualDeductInput === "") {
      toast.error("请填写实际扣款金额");
      return;
    }
    setLoading(true);
    try {
      // Always pass quantity (shares) and price (nav/unit price) downstream
      const roundedQty = isFund ? parseFloat(buyQty.toFixed(4)) : buyQty;
      const parsedActual = parseFloat(actualDeductInput);
      const actualDeduct = currencyMismatch && !isNaN(parsedActual) && parsedActual > 0
        ? parsedActual
        : undefined;
      await onConfirm({ quantity: roundedQty, price: prc, accountId, deductAmountOverride: actualDeduct });
      setAmountOrQty("");
      setPrice("");
      setAccountId("");
      setActualDeductInput("");
      onOpenChange(false);
    } catch (err) {
      console.error("BuyDialog: onConfirm failed", err);
      toast.error("操作失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setAmountOrQty("");
      setPrice("");
      setAccountId("");
      setActualDeductInput("");
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
          当前持仓：{currentQuantity}{unitLabel} · 成本 {CURRENCIES[holdingCurrency].symbol}{currentBuyPrice.toFixed(isFund ? 4 : 2)}
        </div>
        <div className="space-y-3">

          {/* Input 1: 投入金额 (fund) or 数量 (stock) */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {isFund ? "投入金额" : "买入数量"}
            </div>
            <Input
              type="number"
              placeholder={isFund ? `金额（${CURRENCIES[holdingCurrency].symbol}）` : `数量（${unitLabel}）`}
              value={amountOrQty}
              onChange={(e) => setAmountOrQty(e.target.value)}
              step={isFund ? "1" : "0.01"}
              className="rounded-xl"
              autoFocus
            />
          </div>

          {/* Input 2: 净值 (fund) or 单价 (stock) */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {isFund ? "买入净值" : "买入单价"}
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

          {/* 跨币种买入：实际扣款金额 */}
          {currencyMismatch && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                实际扣款金额（{selectedAccount && CURRENCIES[selectedAccount.currency].symbol}，从 IBKR 账单查看）
              </div>
              <Input
                type="number"
                placeholder={`实际扣款金额（${selectedAccount ? selectedAccount.currency : ""}）`}
                value={actualDeductInput}
                onChange={(e) => setActualDeductInput(e.target.value)}
                step="0.01"
                className="rounded-xl"
              />
            </div>
          )}

          {/* Currency mismatch warning */}
          {currencyMismatch && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-2 text-xs text-amber-800">
              ⚠️ 币种不匹配：持仓为 {CURRENCIES[holdingCurrency].name}（{holdingCurrency}），账户为 {CURRENCIES[selectedAccount.currency].name}（{selectedAccount.currency}）。请在上方填写 IBKR 实际扣款金额，持仓成本将以 {holdingCurrency} 记录。
            </div>
          )}

          {/* Preview */}
          {isValid && newQuantity != null && newAvgCost != null && deductAmount != null && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1">
              <div className="text-muted-foreground mb-1">买入后预览</div>
              {isFund && (
                <div className="flex justify-between">
                  <span>获得份额</span>
                  <span className="font-medium">
                    ≈ <strong>{buyQty.toFixed(4)} 份</strong>
                    <span className="text-muted-foreground ml-1">({inputAmount} ÷ {prc})</span>
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span>总{unitLabel}数</span>
                <span className="font-medium">
                  {currentQuantity.toFixed(isFund ? 4 : 2)} + {buyQty.toFixed(isFund ? 4 : 2)} = <strong>{newQuantity.toFixed(isFund ? 4 : 2)}{unitLabel}</strong>
                </span>
              </div>
              <div className="flex justify-between">
                <span>加权平均成本</span>
                <span className="font-medium">
                  <strong>{CURRENCIES[holdingCurrency].symbol}{newAvgCost.toFixed(isFund ? 4 : 2)}</strong>
                </span>
              </div>
              <div className="border-t border-dashed border-emerald-300 my-1" />
              <div className="flex justify-between">
                <span>扣款金额</span>
                <span className="font-semibold text-red-600">
                  -{formatMoney(deductAmount, currencyMismatch && selectedAccount ? selectedAccount.currency : holdingCurrency)}
                </span>
              </div>
              {remainingBalance != null && selectedAccount && (
                <div className="flex justify-between">
                  <span>账户剩余</span>
                  <span className="font-medium">{formatMoney(remainingBalance, selectedAccount.currency)}</span>
                </div>
              )}
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
