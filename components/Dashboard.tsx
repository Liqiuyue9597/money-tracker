"use client";

import { useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { formatMoney, type Currency } from "@/lib/supabase";
import { useMonthTransactions } from "@/lib/swr-hooks";
import { format, subMonths, endOfMonth } from "date-fns";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  BarChart3,
} from "lucide-react";

// ---------- MoM comparison badge ----------
function MomBadge({
  current,
  previous,
  currency,
}: {
  current: number;
  previous: number | null;
  currency: Currency;
}) {
  if (previous == null || (previous === 0 && current === 0)) return null;
  const diff = current - previous;
  if (diff === 0) return null;

  const isUp = diff > 0;
  const pct = previous > 0 ? (diff / previous) * 100 : null;

  return (
    <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
      {isUp ? "↑" : "↓"} 比上月{isUp ? "多" : "少"}{" "}
      {formatMoney(Math.abs(diff), currency)}
      {pct != null && ` (${isUp ? "+" : ""}${pct.toFixed(1)}%)`}
    </p>
  );
}

export function Dashboard() {
  const { user, mainCurrency, monthlyBudget } = useApp();
  const now = useMemo(() => new Date(), []);
  const prevMonth = useMemo(() => subMonths(now, 1), [now]);

  // Current & previous month transactions
  const { data: transactions, isLoading: txLoading } = useMonthTransactions(user?.id, now);
  const { data: prevTransactions } = useMonthTransactions(user?.id, prevMonth);

  // Derive current month stats
  const { monthExpense, monthIncome, topCategories } = useMemo(() => {
    if (!transactions) return { monthExpense: 0, monthIncome: 0, topCategories: [] };
    let exp = 0, inc = 0;
    const catMap: Record<string, { name: string; icon: string; amount: number }> = {};
    for (const t of transactions) {
      if (t.type === "transfer") continue;
      const amt = Number(t.amount);
      if (t.type === "expense") {
        exp += amt;
        const catName = t.categories?.name || "其他";
        const catIcon = t.categories?.icon || "📌";
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
    };
  }, [transactions]);

  // Derive previous month stats
  const prevMonthStats = useMemo(() => {
    if (!prevTransactions) return null;
    let expense = 0, income = 0;
    const catMap: Record<string, number> = {};
    for (const t of prevTransactions) {
      if (t.type === "transfer") continue;
      const amt = Number(t.amount);
      if (t.type === "expense") {
        expense += amt;
        const catName = t.categories?.name || "其他";
        catMap[catName] = (catMap[catName] ?? 0) + amt;
      } else {
        income += amt;
      }
    }
    return { expense, income, catMap };
  }, [prevTransactions]);

  // Budget calculations
  const budgetPct = useMemo(() => {
    if (monthlyBudget == null || monthlyBudget === 0) return 0;
    return (monthExpense / monthlyBudget) * 100;
  }, [monthExpense, monthlyBudget]);

  const budgetRemaining = useMemo(() => {
    if (monthlyBudget == null) return 0;
    return monthlyBudget - monthExpense;
  }, [monthExpense, monthlyBudget]);

  const daysRemaining = useMemo(() => {
    const today = new Date();
    return endOfMonth(today).getDate() - today.getDate();
  }, []);

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

      {/* Expense / Income cards with MoM comparison */}
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
            <MomBadge
              current={monthExpense}
              previous={prevMonthStats?.expense ?? null}
              currency={mainCurrency}
            />
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
            <MomBadge
              current={monthIncome}
              previous={prevMonthStats?.income ?? null}
              currency={mainCurrency}
            />
          </CardContent>
        </Card>
      </div>

      {/* Budget Progress */}
      {monthlyBudget != null ? (
        <Card className="mb-4">
          <CardContent className="pt-0">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-sm">本月预算</p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(monthExpense, mainCurrency)} / {formatMoney(monthlyBudget, mainCurrency)}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  budgetPct >= 100
                    ? "bg-red-500"
                    : budgetPct >= 80
                      ? "bg-orange-400"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                {budgetRemaining >= 0
                  ? `剩余 ${formatMoney(budgetRemaining, mainCurrency)}`
                  : `超支 ${formatMoney(Math.abs(budgetRemaining), mainCurrency)}`}
              </span>
              {daysRemaining > 0 && budgetRemaining > 0 && (
                <span className="tabular-nums">
                  日均可用 {formatMoney(budgetRemaining / daysRemaining, mainCurrency)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Link
          href="/settings"
          className="block mb-4 text-center text-xs text-muted-foreground hover:text-primary py-3 border border-dashed rounded-xl"
        >
          设置每月预算，追踪支出进度 →
        </Link>
      )}

      {/* Top Spending Categories with MoM */}
      {topCategories.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-0">
            <p className="font-medium text-sm mb-3">支出构成</p>
            <div className="space-y-3">
              {topCategories.map((cat) => {
                const pct =
                  monthExpense > 0 ? (cat.amount / monthExpense) * 100 : 0;
                const prevAmt = prevMonthStats?.catMap[cat.name] ?? 0;
                const catDiff = prevAmt > 0 ? cat.amount - prevAmt : null;
                const catDiffPct = prevAmt > 0 && catDiff != null ? (catDiff / prevAmt) * 100 : null;
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground tabular-nums">
                          {formatMoney(cat.amount, mainCurrency)}
                        </span>
                        {catDiffPct != null && catDiff !== 0 && (
                          <span
                            className={`text-[10px] tabular-nums ${
                              catDiff! > 0 ? "text-red-400" : "text-emerald-400"
                            }`}
                          >
                            {catDiff! > 0 ? "↑" : "↓"}
                            {Math.abs(catDiffPct).toFixed(0)}%
                          </span>
                        )}
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
