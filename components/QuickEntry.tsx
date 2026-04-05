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
import { ArrowDownUp, Delete, Check } from "lucide-react";

export function QuickEntry() {
  const { user, categories, accounts, refreshAccounts } = useApp();
  const router = useRouter();
  const [amount, setAmount] = useState("0");
  const [type, setType] = useState<TransactionType>("expense");
  const [currency, setCurrency] = useState<Currency>("CNY");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
      setCurrency(accounts[0].currency);
    }
  }, [accounts]);

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
    if (!categoryId) {
      toast.error("请选择分类");
      return;
    }
    if (!accountId) {
      toast.error("请选择账户");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type,
      amount: numAmount,
      currency,
      category_id: categoryId,
      account_id: accountId,
      note,
      date: new Date().toISOString().split("T")[0],
    });

    if (error) {
      toast.error("保存失败: " + error.message);
    } else {
      const acc = accounts.find((a) => a.id === accountId);
      toast.success(
        `${type === "expense" ? "支出" : "收入"} ${formatMoney(numAmount, currency)}${acc ? ` · ${acc.name}` : ""}`
      );
      setAmount("0");
      setNote("");
      setCategoryId("");
      refreshAccounts();
      router.refresh();
    }
    setSaving(false);
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
    <div className="flex flex-col h-full max-w-lg mx-auto">
      {/* Type toggle */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
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

      {/* Account picker */}
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

      {/* Amount */}
      <div className="px-4 py-6 text-center">
        <div
          className={`text-5xl font-bold tabular-nums ${
            type === "income" ? "text-emerald-600" : "text-foreground"
          }`}
        >
          <span className="text-3xl text-muted-foreground">
            {CURRENCIES[currency].symbol}
          </span>
          {amount}
        </div>
      </div>

      {/* Category grid */}
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
      <div className="mt-auto px-4 pt-3 pb-20 border-t">
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
          className="mt-2 w-full h-12 rounded-xl text-base gap-2"
        >
          <Check className="h-5 w-5" />
          {saving
            ? "保存中..."
            : `保存${numAmount > 0 ? " " + formatMoney(numAmount, currency) : ""}`}
        </Button>
      </div>
    </div>
  );
}
