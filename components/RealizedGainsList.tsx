"use client";

import { useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { useRealizedGains, useExchangeRates } from "@/lib/swr-hooks";
import { type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
import { convertCurrency } from "@/lib/exchange";
import { Card, CardContent } from "@/components/ui/card";

function getAssetTypeLabel(type: string): string {
  switch (type) {
    case "us":     return "美股";
    case "hk":     return "港股";
    case "fund":   return "基金";
    case "crypto": return "加密";
    default:       return type;
  }
}

interface MergedGain {
  id: string;
  symbol: string;
  name: string;
  asset_type: string;
  currency: string;
  cost_basis: number;
  proceeds: number;
  realized_pnl: number;
  realized_pnl_pct: number;
  latest_closed_at: string;
  count: number;
}

function mergeGains(
  gains: { id: string; symbol: string; name: string; asset_type: string; currency: string; cost_basis: number | string; proceeds: number | string; realized_pnl: number | string; closed_at: string }[]
): MergedGain[] {
  const groups = new Map<string, MergedGain>();

  for (const g of gains) {
    const key = `${g.asset_type}:${g.symbol}`;
    const cost = Number(g.cost_basis);
    const proceeds = Number(g.proceeds);
    const pnl = Number(g.realized_pnl);

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: g.id,
        symbol: g.symbol,
        name: g.name,
        asset_type: g.asset_type,
        currency: g.currency,
        cost_basis: cost,
        proceeds: proceeds,
        realized_pnl: pnl,
        realized_pnl_pct: cost > 0 ? (pnl / cost) * 100 : 0,
        latest_closed_at: g.closed_at,
        count: 1,
      });
    } else {
      existing.cost_basis += cost;
      existing.proceeds += proceeds;
      existing.realized_pnl += pnl;
      existing.realized_pnl_pct =
        existing.cost_basis > 0 ? (existing.realized_pnl / existing.cost_basis) * 100 : 0;
      existing.count += 1;
      // 取最新一条的 id / name / closed_at（gains 已按 closed_at desc 排序，所以首次遇到的就是最新）
      // 这里的分支表示后续遇到的是更早的，不更新 latest 字段
    }
  }

  // 输入 gains 已是 closed_at desc，但分组顺序可能与首次出现顺序不一致；按 latest_closed_at desc 重新排序保证稳定
  return Array.from(groups.values()).sort((a, b) =>
    a.latest_closed_at < b.latest_closed_at ? 1 : a.latest_closed_at > b.latest_closed_at ? -1 : 0
  );
}

export function RealizedGainsList() {
  const { user, mainCurrency } = useApp();
  const { data: gains = [], isLoading, error } = useRealizedGains(user?.id);
  const { data: rates } = useExchangeRates(mainCurrency);
  const rateMap = rates?.rates;

  const merged = useMemo(() => mergeGains(gains), [gains]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isAggregated = merged.length !== gains.length;

  const totalPnl = useMemo(
    () =>
      rateMap
        ? gains.reduce(
            (sum, g) =>
              sum + convertCurrency(g.realized_pnl, g.currency as Currency, mainCurrency, rateMap),
            0
          )
        : null,
    [gains, mainCurrency, rateMap]
  );

  if (isLoading) return null;

  if (error) {
    return (
      <div className="mt-6 text-center py-4 text-sm text-muted-foreground">
        加载已实现收益失败
      </div>
    );
  }

  if (gains.length === 0) return null;

  return (
    <div className="mt-6">
      {/* Section divider */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">已实现收益</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Summary card */}
      <Card className="mb-3 border-0 bg-muted/40">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">历史总收益</div>
            <div className="text-xs text-muted-foreground mt-0.5">共 {gains.length} 笔</div>
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${
              totalPnl === null ? "text-muted-foreground" : totalPnl >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {totalPnl === null
              ? "—"
              : `${totalPnl >= 0 ? "+" : ""}${formatMoney(totalPnl, mainCurrency)}`}
          </div>
        </CardContent>
      </Card>

      {/* Individual records */}
      <div className="space-y-2">
        {merged.map((g) => {
          const isPositive = g.realized_pnl >= 0;
          const currSymbol = CURRENCIES[g.currency as Currency]?.symbol ?? "";
          return (
            <Card key={g.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[15px]">{g.symbol}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {getAssetTypeLabel(g.asset_type)}
                      </span>
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-0.5">{g.name}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold text-sm tabular-nums ${
                        isPositive ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {isPositive ? "+" : "−"}
                      {currSymbol}
                      {Math.abs(g.realized_pnl).toFixed(2)}
                    </div>
                    <div
                      className={`text-xs tabular-nums ${
                        isPositive ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {g.realized_pnl_pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                  <span>成本 {currSymbol}{g.cost_basis.toFixed(2)}</span>
                  <span>·</span>
                  <span>收入 {currSymbol}{g.proceeds.toFixed(2)}</span>
                  <span>·</span>
                  <span>{g.latest_closed_at.slice(0, 10)}</span>
                  {g.count > 1 && (
                    <>
                      <span>·</span>
                      <span>共 {g.count} 笔</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
