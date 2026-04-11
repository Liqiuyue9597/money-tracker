"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppProvider";
import {
  supabase,
  type Currency,
  type TransactionType,
  CURRENCIES,
  formatMoney,
} from "@/lib/supabase";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDownUp, Delete, Check, ArrowRight, X } from "lucide-react";

export function QuickEntry() {
  const { user, categories, accounts, refreshAccounts } = useApp();
  const router = useRouter();
  const [amount, setAmount] = useState("0");
  const [type, setType] = useState<TransactionType>("expense");
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const isTransfer = type === "transfer";

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
      setCurrency(accounts[0].currency);
    }
  }, [accounts]);

  // Auto-select a different to_account when entering transfer mode
  useEffect(() => {
    if (isTransfer && !toAccountId && accounts.length > 1) {
      const other = accounts.find((a) => a.id !== accountId);
      if (other) setToAccountId(other.id);
    }
  }, [isTransfer, accounts, accountId]);

  const filteredCategories = categories.filter((c) => c.type === type);

  function handleKeypad(key: string) {
    if (key === "delete") {
      setAmount((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
    } else if (key === ".") {
      if (!amount.includes(".")) setAmount((prev) => prev + ".");
    } else {
      const parts = amount.split(".");
      if (parts[1] && parts[1].length >= 2) return;
      setAmount((prev) => (prev === "0" ? key : prev + key));
    }
  }

  async function handleSave() {
    if (!user) return;
    const numAmount = parseFloat(amount);
    if (numAmount <= 0) {
      toast.error("请输入金额");
      return;
    }
    if (!isTransfer && !categoryId) {
      toast.error("请选择分类");
      return;
    }
    if (!accountId) {
      toast.error(isTransfer ? "请选择转出账户" : "请选择账户");
      return;
    }
    if (isTransfer && !toAccountId) {
      toast.error("请选择转入账户");
      return;
    }
    if (isTransfer && accountId === toAccountId) {
      toast.error("转出和转入账户不能相同");
      return;
    }

    setSaving(true);
    try {
      const record: Record<string, unknown> = {
        user_id: user.id,
        type,
        amount: numAmount,
        currency,
        account_id: accountId,
        note,
        date: new Date().toISOString().split("T")[0],
      };

      if (isTransfer) {
        record.to_account_id = toAccountId;
        // Transfer has no category
      } else {
        record.category_id = categoryId;
      }

      const { error } = await supabase.from("transactions").insert(record);

      if (error) {
        toast.error("保存失败: " + error.message);
      } else {
        if (isTransfer) {
          const fromAcc = accounts.find((a) => a.id === accountId);
          const toAcc = accounts.find((a) => a.id === toAccountId);
          toast.success(
            `转账 ${formatMoney(numAmount, currency)}${fromAcc ? ` · ${fromAcc.name}` : ""} → ${toAcc ? toAcc.name : ""}`
          );
        } else {
          const acc = accounts.find((a) => a.id === accountId);
          toast.success(
            `${type === "expense" ? "支出" : "收入"} ${formatMoney(numAmount, currency)}${acc ? ` · ${acc.name}` : ""}`
          );
        }
        setAmount("0");
        setNote("");
        setCategoryId("");
        refreshAccounts();
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to save transaction:", err);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const numAmount = parseFloat(amount) || 0;
  const keypadKeys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    ".",
    "0",
    "delete",
  ];

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Type toggle + close button */}
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="关闭"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex rounded-xl bg-muted p-1 gap-1">
          <button
            onClick={() => {
              setType("expense");
              setCategoryId("");
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              type === "expense"
                ? "bg-background text-destructive shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            支出
          </button>
          <button
            onClick={() => {
              setType("income");
              setCategoryId("");
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              type === "income"
                ? "bg-background text-emerald-600 shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            收入
          </button>
          <button
            onClick={() => {
              setType("transfer");
              setCategoryId("");
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              type === "transfer"
                ? "bg-background text-blue-600 shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            转账
          </button>
        </div>
        <button
          onClick={() => {
            const currencies: Currency[] = ["CNY", "USD", "HKD"];
            const idx = currencies.indexOf(currency);
            setCurrency(currencies[(idx + 1) % currencies.length]);
          }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {currency}
        </button>
      </div>

      {/* Account picker(s) */}
      {isTransfer ? (
        <div className="px-4 pb-3 space-y-2">
          {/* From account */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">从</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    setAccountId(acc.id);
                    setCurrency(acc.currency);
                    if (acc.id === toAccountId) {
                      const other = accounts.find(
                        (a) => a.id !== acc.id
                      );
                      if (other) setToAccountId(other.id);
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shrink-0 transition-all ${
                    accountId === acc.id
                      ? "bg-blue-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="text-base">{acc.icon}</span>
                  {acc.name}
                </button>
              ))}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 text-blue-500" />
          </div>

          {/* To account */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">到</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    setToAccountId(acc.id);
                    if (acc.id === accountId) {
                      const other = accounts.find(
                        (a) => a.id !== acc.id
                      );
                      if (other) {
                        setAccountId(other.id);
                        setCurrency(other.currency);
                      }
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shrink-0 transition-all ${
                    toAccountId === acc.id
                      ? "bg-blue-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="text-base">{acc.icon}</span>
                  {acc.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => {
                setAccountId(acc.id);
                setCurrency(acc.currency);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shrink-0 transition-all ${
                accountId === acc.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="text-base">{acc.icon}</span>
              {acc.name}
            </button>
          ))}
        </div>
      )}

      {/* Amount */}
      <div className="px-4 py-4 text-center">
        <div
          className={`text-5xl font-bold tabular-nums ${
            type === "income"
              ? "text-emerald-600"
              : type === "transfer"
                ? "text-blue-600"
                : "text-foreground"
          }`}
        >
          <span className="text-3xl text-muted-foreground">
            {CURRENCIES[currency].symbol}
          </span>
          {amount}
        </div>
      </div>

      {/* Category grid — hidden in transfer mode */}
      {!isTransfer && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-2">
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl transition-all active:scale-95 ${
                  categoryId === cat.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted/50 text-foreground hover:bg-muted"
                }`}
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="text-xs font-medium">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div className="px-4 pb-3">
        <Input
          placeholder="备注"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-xl bg-muted/50 border-0 h-10"
        />
      </div>

      {/* Keypad */}
      <div className="px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t">
        <div className="grid grid-cols-3 gap-1.5">
          {keypadKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleKeypad(key)}
              className="flex h-12 items-center justify-center rounded-xl bg-muted/30 transition-colors active:bg-muted hover:bg-muted/60"
            >
              {key === "delete" ? (
                <Delete className="h-5 w-5 text-muted-foreground" />
              ) : (
                <span className="text-lg font-medium">{key}</span>
              )}
            </button>
          ))}
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || numAmount <= 0}
          className={`mt-2 w-full h-12 rounded-xl text-base gap-2 ${
            isTransfer ? "bg-blue-600 hover:bg-blue-700" : ""
          }`}
        >
          <Check className="h-5 w-5" />
          {saving
            ? "保存中..."
            : isTransfer
              ? `转账${numAmount > 0 ? " " + formatMoney(numAmount, currency) : ""}`
              : `保存${numAmount > 0 ? " " + formatMoney(numAmount, currency) : ""}`}
        </Button>
      </div>
    </div>
  );
}
