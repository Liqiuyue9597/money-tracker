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

export function RealizedGainsList() {
  const { user, mainCurrency } = useApp();
  const { data: gains = [], isLoading, error } = useRealizedGains(user?.id);
  const { data: rates } = useExchangeRates(mainCurrency);
  const rateMap = rates?.rates ?? { CNY: 1, USD: 0.137, HKD: 1.07 };

  const totalPnl = useMemo(
    () =>
      gains.reduce(
        (sum, g) =>
          sum + convertCurrency(g.realized_pnl, g.currency as Currency, mainCurrency, rateMap),
        0
      ),
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
              totalPnl >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {totalPnl >= 0 ? "+" : ""}
            {formatMoney(totalPnl, mainCurrency)}
          </div>
        </CardContent>
      </Card>

      {/* Individual records */}
      <div className="space-y-2">
        {gains.map((g) => {
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
                      {isPositive ? "+" : ""}
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
                  <span>成本 {currSymbol}{Number(g.cost_basis).toFixed(2)}</span>
                  <span>·</span>
                  <span>收入 {currSymbol}{Number(g.proceeds).toFixed(2)}</span>
                  <span>·</span>
                  <span>{g.closed_at}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
