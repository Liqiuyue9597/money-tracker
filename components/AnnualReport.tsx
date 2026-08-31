"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { formatMoney } from "@/lib/supabase";
import { useYearTransactions, useYearSnapshots, type NetWorthSnapshot } from "@/lib/swr-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, BarChart3, Calendar } from "lucide-react";

interface CategoryData {
  name: string;
  icon: string;
  amount: number;
  count: number;
}

export function AnnualReport() {
  const { user, mainCurrency } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: transactions, isLoading: loading } = useYearTransactions(user?.id, year);
  const { data: snapshots } = useYearSnapshots(user?.id, year);

  const report = useMemo(() => computeReport(transactions ?? []), [transactions]);
  const netWorthSeries = useMemo(() => computeNetWorthSeries(snapshots ?? []), [snapshots]);

  if (loading && !transactions) {
    return (
      <div className="flex items-center justify-center py-24">
        <BarChart3 className="h-5 w-5 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Year nav */}
      <div className="flex items-center justify-between py-4">
        <button
          onClick={() => setYear((y) => y - 1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold">{year} 年度报告</h1>
        </div>
        <button
          onClick={() => setYear((y) => y + 1)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          disabled={year >= new Date().getFullYear()}
        >
          <ChevronRight className={`h-5 w-5 ${year >= new Date().getFullYear() ? "opacity-30" : ""}`} />
        </button>
      </div>

      {report.expCount === 0 ? (
        <div className="text-center py-20">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">{year} 年暂无记录</p>
        </div>
      ) : (
        <>
          {/* Screen 1: Narrative opener */}
          <Card className="mb-4 bg-gradient-to-br from-primary/5 to-primary/10 border-0">
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">这一年，你花了</p>
              <p className="text-4xl font-bold tabular-nums mb-1">
                {formatMoney(report.expTotal, mainCurrency)}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {report.expCount} 笔支出 · {report.incCount} 笔收入
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {narrateOpener(report, year)}
              </p>
            </CardContent>
          </Card>

          {/* Screen 2: Steady vs Large */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">稳态 vs 一次性</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-[11px] text-muted-foreground">稳态月均</p>
                  <p className="text-base font-bold tabular-nums">
                    {formatMoney(report.steadyMonthlyAvg, mainCurrency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    剔除单笔 &gt; {formatMoney(report.largeThreshold, mainCurrency)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <p className="text-[11px] text-muted-foreground">大额一次性</p>
                  <p className="text-base font-bold tabular-nums text-red-600">
                    {formatMoney(report.largeTotal, mainCurrency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {report.largeCount} 笔 · 占全年 {report.largeSharePct.toFixed(0)}%
                  </p>
                </div>
              </div>

              {report.topLarge.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground mb-2">最贵的几笔</p>
                  <div className="space-y-2">
                    {report.topLarge.slice(0, 5).map((tx, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg shrink-0">{tx.categoryIcon}</span>
                          <div className="min-w-0">
                            <p className="truncate">
                              {tx.note || tx.categoryName}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {tx.date.slice(5)} · {tx.categoryName}
                            </p>
                          </div>
                        </div>
                        <span className="tabular-nums font-semibold text-red-600 shrink-0 ml-2">
                          {formatMoney(tx.amount, mainCurrency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Screen 3: Behavior insights */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">这一年，你...</p>

              {/* Scene counts */}
              {report.topScenes.length > 0 && (
                <div className="space-y-2.5 mb-4">
                  {report.topScenes.slice(0, 4).map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{s.icon}</span>
                        <span>{narrateScene(s.name, s.count)}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatMoney(s.amount, mainCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Weekend vs weekday */}
              {(report.weekendCount + report.weekdayCount) > 0 && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">周末 vs 工作日</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">周末每笔平均</p>
                      <p className="text-base font-bold tabular-nums">
                        {formatMoney(report.weekendAvg, mainCurrency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">工作日每笔平均</p>
                      <p className="text-base font-bold tabular-nums">
                        {formatMoney(report.weekdayAvg, mainCurrency)}
                      </p>
                    </div>
                  </div>
                  {report.weekendAvg > 0 && report.weekdayAvg > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2 text-center">
                      {narrateWeekend(report.weekendAvg, report.weekdayAvg)}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Screen 4a: Expense breakdown */}
          {report.expCategories.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">支出构成</p>
                <div className="space-y-3">
                  {report.expCategories.slice(0, 8).map((cat) => {
                    const pct = report.expTotal > 0 ? (cat.amount / report.expTotal) * 100 : 0;
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

          {/* Screen 4b: Net worth curve */}
          {netWorthSeries.points.length >= 2 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-1">财富变化</p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  基于每月月末快照 · 股票/加密按买入成本计
                </p>

                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-2xl font-bold tabular-nums">
                    {formatMoney(netWorthSeries.latest, mainCurrency)}
                  </p>
                  <p className={`text-sm tabular-nums font-medium ${
                    netWorthSeries.delta >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}>
                    {netWorthSeries.delta >= 0 ? "+" : ""}
                    {formatMoney(netWorthSeries.delta, mainCurrency)}
                  </p>
                </div>

                <NetWorthSparkline points={netWorthSeries.points} />

                <p className="text-[11px] text-muted-foreground mt-3">
                  {netWorthSeries.firstLabel} → {netWorthSeries.lastLabel}
                  {" · "}
                  {netWorthSeries.delta >= 0 ? "累计增加" : "累计减少"} {formatMoney(Math.abs(netWorthSeries.delta), mainCurrency)}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// Compute layer
// ============================================================

interface LargeTx {
  date: string;
  amount: number;
  note: string;
  categoryName: string;
  categoryIcon: string;
}

interface ReportShape {
  expTotal: number;
  incTotal: number;
  expCount: number;
  incCount: number;
  steadyMonthlyAvg: number;
  largeTotal: number;
  largeCount: number;
  largeSharePct: number;
  largeThreshold: number;
  topLarge: LargeTx[];
  expCategories: CategoryData[];
  topScenes: CategoryData[];
  weekendCount: number;
  weekdayCount: number;
  weekendAvg: number;
  weekdayAvg: number;
}

interface JoinedTx {
  type: "expense" | "income" | "transfer";
  amount: number | string;
  date: string;
  note?: string;
  categories?: { name: string; icon: string } | null;
}

function computeReport(transactions: JoinedTx[]): ReportShape {
  const empty: ReportShape = {
    expTotal: 0, incTotal: 0, expCount: 0, incCount: 0,
    steadyMonthlyAvg: 0, largeTotal: 0, largeCount: 0, largeSharePct: 0,
    largeThreshold: 0,
    topLarge: [], expCategories: [], topScenes: [],
    weekendCount: 0, weekdayCount: 0, weekendAvg: 0, weekdayAvg: 0,
  };
  if (transactions.length === 0) return empty;

  const expenses = transactions.filter((t) => t.type === "expense");
  const incomes = transactions.filter((t) => t.type === "income");

  if (expenses.length === 0) {
    return { ...empty, incCount: incomes.length, incTotal: incomes.reduce((s, t) => s + Number(t.amount), 0) };
  }

  const expTotal = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const incTotal = incomes.reduce((s, t) => s + Number(t.amount), 0);

  // P95 threshold for "large", rounded up to human-friendly bucket
  const sortedAmts = [...expenses].map((t) => Number(t.amount)).sort((a, b) => a - b);
  const p95Idx = Math.floor(sortedAmts.length * 0.95);
  const p95Raw = sortedAmts[Math.min(p95Idx, sortedAmts.length - 1)] || 0;
  const buckets = [50, 100, 200, 300, 500, 1000, 2000, 5000, 10000];
  const p95 = buckets.find((b) => b >= p95Raw) ?? Math.ceil(p95Raw / 1000) * 1000;

  const largeTx = expenses.filter((t) => Number(t.amount) > p95);
  const steadyTx = expenses.filter((t) => Number(t.amount) <= p95);
  const largeTotal = largeTx.reduce((s, t) => s + Number(t.amount), 0);
  const steadyTotal = steadyTx.reduce((s, t) => s + Number(t.amount), 0);
  const monthsWithData = new Set(expenses.map((t) => t.date.substring(0, 7))).size || 1;
  const steadyMonthlyAvg = steadyTotal / monthsWithData;

  // Top large
  const topLarge: LargeTx[] = largeTx
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)
    .map((t) => ({
      date: t.date,
      amount: Number(t.amount),
      note: t.note ?? "",
      categoryName: t.categories?.name ?? "其他",
      categoryIcon: t.categories?.icon ?? "📌",
    }));

  // Expense categories
  const catMap = new Map<string, CategoryData>();
  for (const t of expenses) {
    const name = t.categories?.name ?? "未分类";
    const icon = t.categories?.icon ?? "📌";
    const cur = catMap.get(name) ?? { name, icon, amount: 0, count: 0 };
    cur.amount += Number(t.amount);
    cur.count += 1;
    catMap.set(name, cur);
  }
  const expCategories = Array.from(catMap.values()).sort((a, b) => b.amount - a.amount);

  // Top scenes = categories by count (frequency-oriented)
  const topScenes = Array.from(catMap.values()).sort((a, b) => b.count - a.count);

  // Weekend vs weekday
  let weCnt = 0, wdCnt = 0, weSum = 0, wdSum = 0;
  for (const t of expenses) {
    const dow = new Date(t.date + "T00:00:00").getDay(); // 0=Sun, 6=Sat
    const amt = Number(t.amount);
    if (dow === 0 || dow === 6) { weCnt++; weSum += amt; }
    else { wdCnt++; wdSum += amt; }
  }

  return {
    expTotal, incTotal,
    expCount: expenses.length, incCount: incomes.length,
    steadyMonthlyAvg,
    largeTotal,
    largeCount: largeTx.length,
    largeSharePct: expTotal > 0 ? (largeTotal / expTotal) * 100 : 0,
    largeThreshold: p95,
    topLarge,
    expCategories,
    topScenes,
    weekendCount: weCnt,
    weekdayCount: wdCnt,
    weekendAvg: weCnt > 0 ? weSum / weCnt : 0,
    weekdayAvg: wdCnt > 0 ? wdSum / wdCnt : 0,
  };
}

// ============================================================
// Narrative helpers
// ============================================================

function narrateOpener(r: ReportShape, year: number): string {
  const today = new Date();
  const isCurrent = year === today.getFullYear();
  const perDay = r.expCount / (isCurrent
    ? Math.max(1, Math.floor((today.getTime() - new Date(`${year}-01-01`).getTime()) / 86400000))
    : 365);
  return `平均每天 ${perDay.toFixed(1)} 笔。`;
}

function narrateScene(name: string, count: number): string {
  const dict: Record<string, string> = {
    咖啡: `去了 ${count} 次咖啡店`,
    餐饮: `记账 ${count} 次吃饭`,
    交通: `打车/坐车 ${count} 次`,
    购物: `购物 ${count} 次`,
    零食: `买了 ${count} 次零食`,
    娱乐: `娱乐 ${count} 次`,
  };
  return dict[name] ?? `${name} ${count} 次`;
}

function narrateWeekend(weAvg: number, wdAvg: number): string {
  const ratio = weAvg / Math.max(1, wdAvg);
  if (ratio > 1.5) return `周末每笔平均比工作日多 ${((ratio - 1) * 100).toFixed(0)}%，你在周末更"松手"`;
  if (ratio < 0.7) return `工作日每笔平均比周末多 ${((1 / ratio - 1) * 100).toFixed(0)}%`;
  return "周末和工作日的花钱习惯差不多";
}

// ============================================================
// Net-worth series
// ============================================================

interface NWSeries {
  points: Array<{ date: string; value: number }>;
  latest: number;
  delta: number;
  firstLabel: string;
  lastLabel: string;
}

function computeNetWorthSeries(snapshots: NetWorthSnapshot[]): NWSeries {
  if (snapshots.length === 0) {
    return { points: [], latest: 0, delta: 0, firstLabel: "", lastLabel: "" };
  }
  // Convert each snapshot to a single CNY total (using stock/crypto cost, not market)
  const points = snapshots.map((s) => {
    const rateUsd = s.rate_usd_to_cny ?? 7.2;
    const rateHkd = s.rate_hkd_to_cny ?? 0.92;
    const cash = Number(s.cash_cny) + Number(s.cash_usd) * rateUsd + Number(s.cash_hkd) * rateHkd;
    const brok = Number(s.brokerage_cny) + Number(s.brokerage_usd) * rateUsd + Number(s.brokerage_hkd) * rateHkd;
    const stock = Number(s.stock_cost_cny);
    const crypto = Number(s.crypto_cost_cny);
    return { date: s.snapshot_date, value: cash + brok + stock + crypto };
  });
  const first = points[0].value;
  const last = points[points.length - 1].value;
  return {
    points,
    latest: last,
    delta: last - first,
    firstLabel: labelMonth(points[0].date),
    lastLabel: labelMonth(points[points.length - 1].date),
  };
}

function labelMonth(d: string): string {
  const parts = d.split("-");
  return `${parts[0]}年${parseInt(parts[1])}月`;
}

// ============================================================
// Sparkline
// ============================================================

function NetWorthSparkline({ points }: { points: Array<{ date: string; value: number }> }) {
  const w = 300, h = 60, pad = 4;
  const vals = points.map((p) => p.value);
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const range = Math.max(1, vMax - vMin);

  const coords = points.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
    const y = h - pad - ((p.value - vMin) / range) * (h - pad * 2);
    return { x, y };
  });

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14">
      <path d={areaD} fill="currentColor" fillOpacity="0.1" className="text-primary" />
      <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2" fill="currentColor" className="text-primary" />
      ))}
    </svg>
  );
}
