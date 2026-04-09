"use client";

import { useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { formatMoney } from "@/lib/supabase";
import { useMonthTransactions } from "@/lib/swr-hooks";
import { format } from "date-fns";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  BarChart3,
} from "lucide-react";

export function Dashboard() {
  const { user, mainCurrency, accounts } = useApp();
  const now = useMemo(() => new Date(), []);

  // SWR hooks — cached & deduplicated across components
  const { data: transactions, isLoading: txLoading } = useMonthTransactions(user?.id, now);

  // Derive monthly stats
  const { monthExpense, monthIncome, topCategories, recentTransactions } = useMemo(() => {
    if (!transactions) return { monthExpense: 0, monthIncome: 0, topCategories: [], recentTransactions: [] };
    let exp = 0, inc = 0;
    const catMap: Record<string, { name: string; icon: string; amount: number }> = {};
    for (const t of transactions) {
      if (t.type === "transfer") continue; // Skip transfers from stats
      const amt = Number(t.amount);
      if (t.type === "expense") {
        exp += amt;
        const catName = t.categories?.name || "\u5176\u4ed6";
        const catIcon = t.categories?.icon || "\ud83d\udccc";
        if (!catMap[catName]) catMap[catName] = { name: catName, icon: catIcon, amount: 0 };
        catMap[catName].amount += amt;
      } else {
        inc += amt;
      }
    }
    return {
      monthExpense: exp,
      monthIncome: inc,
      topCategories: Object.values(catMap).sort((a, b) => b.amount - a.amount).slice(0, 5),
      recentTransactions: transactions.slice(0, 5),
    };
  }, [transactions]);

  const net = monthIncome - monthExpense;

  // Only show full-page spinner on very first load (no cached data yet)
  if (txLoading && !transactions) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Header */}
      <div className="pt-6 pb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">概览</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(), "yyyy年M月")}
          </p>
        </div>
        <Link href="/report" className="flex items-center gap-1 text-xs text-primary hover:underline">
          <BarChart3 className="h-3.5 w-3.5" />
          年度报告
        </Link>
      </div>

      {/* Expense / Income cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="bg-red-50 border-0 ring-0">
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">支出</span>
            </div>
            <p className="text-xl font-bold text-red-600 tabular-nums">
              {formatMoney(monthExpense, mainCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-0 ring-0">
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">收入</span>
            </div>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">
              {formatMoney(monthIncome, mainCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net income */}
      <Card className="mb-4 bg-primary/5 border-0 ring-0">
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">本月净收入</p>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  net >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {net >= 0 ? "+" : "-"}
                {formatMoney(net, mainCurrency)}
              </p>
            </div>
            {net >= 0 ? (
              <TrendingUp className="h-8 w-8 text-emerald-500/30" />
            ) : (
              <TrendingDown className="h-8 w-8 text-red-500/30" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Summary */}
      {accounts.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">账户</span>
              </div>
              <Link
                href="/assets"
                className="text-xs text-primary hover:underline"
              >
                查看全部 →
              </Link>
            </div>
            <div className="space-y-3">
              {accounts.slice(0, 4).map((acc) => (
                <div key={acc.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{acc.icon}</span>
                    <span className="text-sm">{acc.name}</span>
                  </div>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      Number(acc.balance) < 0
                        ? "text-red-600"
                        : "text-foreground"
                    }`}
                  >
                    {Number(acc.balance) < 0 ? "-" : ""}
                    {formatMoney(Number(acc.balance), acc.currency)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-0">
            <p className="font-medium text-sm mb-3">最近记录</p>
            <div className="space-y-3">
              {recentTransactions.map((t) => (
                <div key={t.id} className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${
                      t.type === "transfer" ? "bg-blue-100" : "bg-muted"
                    }`}>
                      {t.type === "transfer" ? "🔄" : (t.categories?.icon || "\ud83d\udccc")}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {t.type === "transfer" ? "转账" : (t.categories?.name || "未分类")}
                      </p>
                      {t.type === "transfer" && t.accounts && t.to_accounts ? (
                        <p className="text-xs text-muted-foreground">
                          {t.accounts.name} → {t.to_accounts.name}
                        </p>
                      ) : t.note ? (
                        <p className="text-xs text-muted-foreground">{t.note}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-medium tabular-nums ${
                        t.type === "transfer"
                          ? "text-blue-600"
                          : t.type === "income"
                            ? "text-emerald-600"
                            : "text-foreground"
                      }`}
                    >
                      {t.type === "transfer" ? "" : t.type === "expense" ? "-" : "+"}
                      {formatMoney(Number(t.amount), t.currency)}
                    </p>
                    {t.type !== "transfer" && t.accounts && (
                      <p className="text-xs text-muted-foreground">
                        {t.accounts.name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Spending Categories */}
      {topCategories.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-0">
            <p className="font-medium text-sm mb-3">支出构成</p>
            <div className="space-y-3">
              {topCategories.map((cat) => {
                const pct =
                  monthExpense > 0 ? (cat.amount / monthExpense) * 100 : 0;
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMoney(cat.amount, mainCurrency)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
