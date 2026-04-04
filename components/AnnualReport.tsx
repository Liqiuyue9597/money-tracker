"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  BarChart3,
  PieChart,
  Wallet,
} from "lucide-react";

interface MonthData {
  month: string; // "2026-01"
  expense: number;
  income: number;
}

interface CategoryData {
  name: string;
  icon: string;
  amount: number;
}

interface AccountData {
  name: string;
  icon: string;
  amount: number;
}

export function AnnualReport() {
  const { user, mainCurrency } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [totalExpense, setTotalExpense] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [topExpenseCategories, setTopExpenseCategories] = useState<CategoryData[]>([]);
  const [topIncomeCategories, setTopIncomeCategories] = useState<CategoryData[]>([]);
  const [topAccounts, setTopAccounts] = useState<AccountData[]>([]);
  const [transactionCount, setTransactionCount] = useState(0);
  const [maxExpenseMonth, setMaxExpenseMonth] = useState<MonthData | null>(null);
  const [maxIncomeMonth, setMaxIncomeMonth] = useState<MonthData | null>(null);
  const [avgMonthlyExpense, setAvgMonthlyExpense] = useState(0);

  useEffect(() => {
    if (user) loadReport();
  }, [user, year]);

  async function loadReport() {
    if (!user) return;
    setLoading(true);

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data: transactions } = await supabase
      .from("transactions")
      .select("*, categories(name, icon), accounts(name, icon)")
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (!transactions || transactions.length === 0) {
      setTotalExpense(0);
      setTotalIncome(0);
      setMonthlyData([]);
      setTopExpenseCategories([]);
      setTopIncomeCategories([]);
      setTopAccounts([]);
      setTransactionCount(0);
      setMaxExpenseMonth(null);
      setMaxIncomeMonth(null);
      setAvgMonthlyExpense(0);
      setLoading(false);
      return;
    }

    setTransactionCount(transactions.length);

    // Calculate totals
    let exp = 0, inc = 0;
    const monthMap: Record<string, { expense: number; income: number }> = {};
    const expCatMap: Record<string, CategoryData> = {};
    const incCatMap: Record<string, CategoryData> = {};
    const accMap: Record<string, AccountData> = {};

    for (const t of transactions) {
      const amt = Number(t.amount);
      const monthKey = t.date.substring(0, 7); // "2026-01"

      if (!monthMap[monthKey]) monthMap[monthKey] = { expense: 0, income: 0 };

      if (t.type === "expense") {
        exp += amt;
        monthMap[monthKey].expense += amt;
        const catName = t.categories?.name || "其他";
        const catIcon = t.categories?.icon || "📌";
        if (!expCatMap[catName]) expCatMap[catName] = { name: catName, icon: catIcon, amount: 0 };
        expCatMap[catName].amount += amt;
      } else {
        inc += amt;
        monthMap[monthKey].income += amt;
        const catName = t.categories?.name || "其他";
        const catIcon = t.categories?.icon || "📌";
        if (!incCatMap[catName]) incCatMap[catName] = { name: catName, icon: catIcon, amount: 0 };
        incCatMap[catName].amount += amt;
      }

      // Account stats (expense only)
      if (t.type === "expense" && t.accounts) {
        const accName = t.accounts.name;
        const accIcon = t.accounts.icon;
        if (!accMap[accName]) accMap[accName] = { name: accName, icon: accIcon, amount: 0 };
        accMap[accName].amount += amt;
      }
    }

    setTotalExpense(exp);
    setTotalIncome(inc);

    // Monthly data (fill all 12 months)
    const months: MonthData[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      months.push({
        month: key,
        expense: monthMap[key]?.expense || 0,
        income: monthMap[key]?.income || 0,
      });
    }
    setMonthlyData(months);

    // Max months
    const monthsWithExp = months.filter((m) => m.expense > 0);
    const monthsWithInc = months.filter((m) => m.income > 0);
    setMaxExpenseMonth(monthsWithExp.sort((a, b) => b.expense - a.expense)[0] || null);
    setMaxIncomeMonth(monthsWithInc.sort((a, b) => b.income - a.income)[0] || null);
    setAvgMonthlyExpense(monthsWithExp.length > 0 ? exp / monthsWithExp.length : 0);

    // Top categories
    setTopExpenseCategories(Object.values(expCatMap).sort((a, b) => b.amount - a.amount).slice(0, 8));
    setTopIncomeCategories(Object.values(incCatMap).sort((a, b) => b.amount - a.amount).slice(0, 5));
    setTopAccounts(Object.values(accMap).sort((a, b) => b.amount - a.amount).slice(0, 5));

    setLoading(false);
  }

  const net = totalIncome - totalExpense;
  const maxExp = Math.max(...monthlyData.map((m) => m.expense), 1);

  function monthLabel(m: string) {
    return `${parseInt(m.split("-")[1])}月`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <BarChart3 className="h-5 w-5 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <button
          onClick={() => setYear((y) => y - 1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold">{year} 年度报告</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            共 {transactionCount} 笔记录
          </p>
        </div>
        <button
          onClick={() => setYear((y) => y + 1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          disabled={year >= new Date().getFullYear()}
        >
          <ChevronRight className={`h-5 w-5 ${year >= new Date().getFullYear() ? "opacity-30" : ""}`} />
        </button>
      </div>

      {transactionCount === 0 ? (
        <div className="text-center py-20">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{year} 年暂无记录</p>
        </div>
      ) : (
        <>
          {/* Annual Summary */}
          <Card className="mb-4 bg-gradient-to-br from-primary/5 to-primary/10 border-0">
            <CardContent className="p-5">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground mb-1">年度净收入</p>
                <p className={`text-3xl font-bold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {net >= 0 ? "+" : "-"}{formatMoney(net, mainCurrency)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                    总支出
                  </div>
                  <p className="text-lg font-bold text-red-600 tabular-nums">
                    {formatMoney(totalExpense, mainCurrency)}
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-1">
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    总收入
                  </div>
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">
                    {formatMoney(totalIncome, mainCurrency)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="border-0 bg-muted/50">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">月均支出</p>
                <p className="text-base font-bold tabular-nums">{formatMoney(avgMonthlyExpense, mainCurrency)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-muted/50">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">储蓄率</p>
                <p className={`text-base font-bold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : "0.0"}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Chart */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">月度支出趋势</span>
              </div>
              <div className="flex items-end gap-1.5" style={{ height: "120px" }}>
                {monthlyData.map((m) => {
                  const pct = maxExp > 0 ? (m.expense / maxExp) * 100 : 0;
                  const isMax = maxExpenseMonth?.month === m.month;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                        {pct > 0 && (
                          <div
                            className={`w-full rounded-t transition-all ${isMax ? "bg-red-400" : "bg-primary/60"}`}
                            style={{ height: `${Math.max(pct, 3)}%` }}
                          />
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground">{parseInt(m.month.split("-")[1])}</span>
                    </div>
                  );
                })}
              </div>
              {maxExpenseMonth && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  支出最高：{monthLabel(maxExpenseMonth.month)} {formatMoney(maxExpenseMonth.expense, mainCurrency)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Expense Categories */}
          {topExpenseCategories.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <PieChart className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">支出构成</span>
                </div>
                <div className="space-y-3">
                  {topExpenseCategories.map((cat) => {
                    const pct = totalExpense > 0 ? (cat.amount / totalExpense) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <div className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.name}</span>
                            <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                          </div>
                          <span className="tabular-nums text-muted-foreground">
                            {formatMoney(cat.amount, mainCurrency)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/70 transition-all"
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

          {/* Income Categories */}
          {topIncomeCategories.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">收入来源</span>
                </div>
                <div className="space-y-3">
                  {topIncomeCategories.map((cat) => {
                    const pct = totalIncome > 0 ? (cat.amount / totalIncome) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <div className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.name}</span>
                            <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                          </div>
                          <span className="tabular-nums text-emerald-600">
                            {formatMoney(cat.amount, mainCurrency)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70 transition-all"
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

          {/* Account Usage */}
          {topAccounts.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">消费账户分布</span>
                </div>
                <div className="space-y-3">
                  {topAccounts.map((acc) => {
                    const pct = totalExpense > 0 ? (acc.amount / totalExpense) * 100 : 0;
                    return (
                      <div key={acc.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{acc.icon}</span>
                          <span className="text-sm">{acc.name}</span>
                          <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                        </div>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {formatMoney(acc.amount, mainCurrency)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Income */}
          {maxIncomeMonth && (
            <Card className="mb-4 bg-emerald-50 border-0">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">收入最高月份</p>
                <p className="text-lg font-bold text-emerald-600 tabular-nums">
                  {monthLabel(maxIncomeMonth.month)} {formatMoney(maxIncomeMonth.income, mainCurrency)}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
