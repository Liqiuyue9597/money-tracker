# 已实现收益 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清仓时自动记录已实现收益，并在投资组合页和资产总览页展示。

**Architecture:** 新建 `realized_gains` 表存储清仓收益；改造 `sell_all_holding` / `sell_all_crypto` 两个 RPC，在清仓事务内写入收益记录；前端新增 SWR hook + `RealizedGainsList` 组件，在两处页面消费数据。

**Tech Stack:** Supabase (PostgreSQL RPC + RLS)、Next.js 16、TypeScript、SWR、Tailwind CSS / shadcn-ui

---

## File Map

| 文件 | 操作 | 说明 |
|------|------|------|
| Supabase Migration | 新建 | 创建 `realized_gains` 表 + RLS |
| Supabase Migration | 新建 | 改造 `sell_all_holding` / `sell_all_crypto` RPC |
| `lib/supabase.ts` | 修改 | 新增 `RealizedGain` interface |
| `lib/swr-hooks.ts` | 修改 | 新增 `useRealizedGains` hook |
| `components/RealizedGainsList.tsx` | 新建 | 已实现收益列表组件（用于 /stocks 页） |
| `components/StockPortfolio.tsx` | 修改 | 渲染 `RealizedGainsList` |
| `components/AssetOverview.tsx` | 修改 | 股票和加密货币板块各增一行已实现收益汇总 |

---

### Task 1: 创建 `realized_gains` 表及 RLS

**Files:**
- Supabase Migration (via MCP `apply_migration`)

- [ ] **Step 1: 执行建表 migration**

通过 Supabase MCP `apply_migration` 执行以下 SQL，name 为 `create_realized_gains`:

```sql
CREATE TABLE public.realized_gains (
  id               uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  symbol           text NOT NULL,
  name             text NOT NULL DEFAULT '',
  asset_type       text NOT NULL CHECK (asset_type IN ('us', 'hk', 'fund', 'crypto')),
  currency         text NOT NULL CHECK (currency IN ('CNY', 'USD', 'HKD')),
  cost_basis       numeric NOT NULL,
  proceeds         numeric NOT NULL,
  realized_pnl     numeric NOT NULL,
  realized_pnl_pct numeric NOT NULL,
  closed_at        date NOT NULL DEFAULT CURRENT_DATE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.realized_gains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own realized gains"
  ON public.realized_gains
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: 验证表已创建**

通过 Supabase MCP `execute_sql` 执行：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'realized_gains'
ORDER BY ordinal_position;
```

预期输出包含 `id, user_id, symbol, name, asset_type, currency, cost_basis, proceeds, realized_pnl, realized_pnl_pct, closed_at, created_at`。

- [ ] **Step 3: 验证 RLS 已启用**

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'realized_gains';
```

预期 `relrowsecurity = true`。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add realized_gains table with RLS"
```

---

### Task 2: 改造 `sell_all_holding` RPC（股票/基金清仓写入收益）

**Files:**
- Supabase Migration (via MCP `apply_migration`)

- [ ] **Step 1: 执行 RPC 改造 migration**

name 为 `update_sell_all_holding_rpc`:

```sql
CREATE OR REPLACE FUNCTION public.sell_all_holding(
  p_holding_id    uuid,
  p_account_id    uuid,
  p_receive_amount numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id        uuid;
  v_symbol         text;
  v_name           text;
  v_buy_price      numeric;
  v_quantity       numeric;
  v_currency       text;
  v_asset_type     text;
  v_cost_basis     numeric;
  v_realized_pnl   numeric;
  v_pnl_pct        numeric;
BEGIN
  SELECT user_id, symbol, name, buy_price, quantity, currency, asset_type
    INTO v_user_id, v_symbol, v_name, v_buy_price, v_quantity, v_currency, v_asset_type
    FROM stock_holdings
    WHERE id = p_holding_id;

  v_cost_basis   := v_buy_price * v_quantity;
  v_realized_pnl := p_receive_amount - v_cost_basis;
  v_pnl_pct      := CASE WHEN v_cost_basis > 0
                         THEN (v_realized_pnl / v_cost_basis) * 100
                         ELSE 0 END;

  INSERT INTO realized_gains
    (user_id, symbol, name, asset_type, currency,
     cost_basis, proceeds, realized_pnl, realized_pnl_pct, closed_at)
  VALUES
    (v_user_id, v_symbol, v_name, v_asset_type, v_currency,
     v_cost_basis, p_receive_amount, v_realized_pnl, v_pnl_pct, CURRENT_DATE);

  DELETE FROM stock_holdings WHERE id = p_holding_id;

  UPDATE accounts
    SET balance = balance + p_receive_amount
    WHERE id = p_account_id;
END;
$$;
```

- [ ] **Step 2: 验证新 RPC 定义**

```sql
SELECT routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'sell_all_holding';
```

预期定义包含 `INSERT INTO realized_gains`。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: sell_all_holding writes realized gain before delete"
```

---

### Task 3: 改造 `sell_all_crypto` RPC（加密货币清仓写入收益）

**Files:**
- Supabase Migration (via MCP `apply_migration`)

- [ ] **Step 1: 执行 RPC 改造 migration**

name 为 `update_sell_all_crypto_rpc`:

```sql
CREATE OR REPLACE FUNCTION public.sell_all_crypto(
  p_holding_id     uuid,
  p_account_id     uuid,
  p_receive_amount numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id        uuid;
  v_symbol         text;
  v_name           text;
  v_buy_price      numeric;
  v_quantity       numeric;
  v_cost_basis     numeric;
  v_realized_pnl   numeric;
  v_pnl_pct        numeric;
BEGIN
  SELECT user_id, symbol, name, buy_price, quantity
    INTO v_user_id, v_symbol, v_name, v_buy_price, v_quantity
    FROM crypto_holdings
    WHERE id = p_holding_id;

  v_cost_basis   := v_buy_price * v_quantity;
  v_realized_pnl := p_receive_amount - v_cost_basis;
  v_pnl_pct      := CASE WHEN v_cost_basis > 0
                         THEN (v_realized_pnl / v_cost_basis) * 100
                         ELSE 0 END;

  INSERT INTO realized_gains
    (user_id, symbol, name, asset_type, currency,
     cost_basis, proceeds, realized_pnl, realized_pnl_pct, closed_at)
  VALUES
    (v_user_id, v_symbol, v_name, 'crypto', 'USD',
     v_cost_basis, p_receive_amount, v_realized_pnl, v_pnl_pct, CURRENT_DATE);

  DELETE FROM crypto_holdings WHERE id = p_holding_id;

  UPDATE accounts
    SET balance = balance + p_receive_amount
    WHERE id = p_account_id;
END;
$$;
```

- [ ] **Step 2: 验证新 RPC 定义**

```sql
SELECT routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'sell_all_crypto';
```

预期定义包含 `INSERT INTO realized_gains`。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: sell_all_crypto writes realized gain before delete"
```

---

### Task 4: 新增 `RealizedGain` 类型 + `useRealizedGains` hook

**Files:**
- Modify: `lib/supabase.ts`
- Modify: `lib/swr-hooks.ts`

- [ ] **Step 1: 在 `lib/supabase.ts` 新增 `RealizedGain` interface**

在文件末尾（`formatMoney` 函数之后）追加：

```ts
export interface RealizedGain {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  asset_type: "us" | "hk" | "fund" | "crypto";
  currency: Currency;
  cost_basis: number;
  proceeds: number;
  realized_pnl: number;
  realized_pnl_pct: number;
  closed_at: string;
  created_at: string;
}
```

- [ ] **Step 2: 在 `lib/swr-hooks.ts` 新增 `useRealizedGains`**

在 import 行（第 1 行）修改，添加 `RealizedGain` 到 supabase 导入：

```ts
import { supabase, type Transaction, type StockHolding, type CryptoHolding, type UserSetting, type RealizedGain } from "@/lib/supabase";
```

在文件末尾（`useUserSettings` 函数之后）追加：

```ts
/** Realized gains — all closed positions, newest first */
export function useRealizedGains(userId: string | undefined) {
  return useSWR<RealizedGain[]>(
    userId ? ["realized_gains", userId] : null,
    async () => {
      const { data, error } = await supabase
        .from("realized_gains")
        .select("*")
        .eq("user_id", userId!)
        .order("closed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}
```

- [ ] **Step 3: 验证构建通过**

```bash
npm run build 2>&1 | tail -20
```

预期：无 TypeScript 错误，build 成功。

- [ ] **Step 4: Commit**

```bash
git add lib/supabase.ts lib/swr-hooks.ts
git commit -m "feat: add RealizedGain type and useRealizedGains SWR hook"
```

---

### Task 5: 新建 `RealizedGainsList` 组件

**Files:**
- Create: `components/RealizedGainsList.tsx`

- [ ] **Step 1: 创建文件**

写入 `components/RealizedGainsList.tsx`：

```tsx
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
```

- [ ] **Step 2: 验证构建通过**

```bash
npm run build 2>&1 | tail -20
```

预期：无 TypeScript 错误。

- [ ] **Step 3: Commit**

```bash
git add components/RealizedGainsList.tsx
git commit -m "feat: add RealizedGainsList component"
```

---

### Task 6: 在 StockPortfolio 页面渲染 RealizedGainsList

**Files:**
- Modify: `components/StockPortfolio.tsx`

- [ ] **Step 1: 添加 import**

在 `components/StockPortfolio.tsx` 顶部，找到现有 import 块末尾，添加：

```ts
import { RealizedGainsList } from "@/components/RealizedGainsList";
```

- [ ] **Step 2: 在 JSX 末尾、卖出 Dialog 之前添加组件**

在 `components/StockPortfolio.tsx` 中，找到：

```tsx
      {/* Buy Dialog */}
      {buyHolding && (
```

在它正上方插入：

```tsx
      {/* Realized Gains */}
      <RealizedGainsList />
```

- [ ] **Step 3: 验证构建通过**

```bash
npm run build 2>&1 | tail -20
```

预期：无报错。

- [ ] **Step 4: Commit**

```bash
git add components/StockPortfolio.tsx
git commit -m "feat: render RealizedGainsList in StockPortfolio"
```

---

### Task 7: 在 AssetOverview 增加已实现收益汇总行

**Files:**
- Modify: `components/AssetOverview.tsx`

- [ ] **Step 1: 添加 import**

在 `components/AssetOverview.tsx` 第 6 行，修改 swr-hooks import，添加 `useRealizedGains`：

```ts
import { useStockHoldings, useStockQuotes, useCryptoHoldings, useCryptoPrices, useExchangeRates, useRealizedGains } from "@/lib/swr-hooks";
```

- [ ] **Step 2: 添加 hook 调用**

在 `components/AssetOverview.tsx` 中，找到现有 hook 调用区域（约第 43 行 `const { data: cryptoPrices }` 之后），新增：

```ts
  const { data: realizedGains = [] } = useRealizedGains(user?.id);
```

- [ ] **Step 3: 添加 realized PnL 计算 memo**

在 `components/AssetOverview.tsx` 中，找到 `// Net worth` 注释上方，插入两个 memo：

```ts
  // Realized PnL totals (converted to mainCurrency)
  const stockRealizedPnl = useMemo(() => {
    return realizedGains
      .filter((g) => g.asset_type !== "crypto")
      .reduce(
        (sum, g) => sum + convertCurrency(g.realized_pnl, g.currency as Currency, mainCurrency, rateMap),
        0
      );
  }, [realizedGains, mainCurrency, rateMap]);

  const cryptoRealizedPnl = useMemo(() => {
    return realizedGains
      .filter((g) => g.asset_type === "crypto")
      .reduce(
        (sum, g) => sum + convertCurrency(g.realized_pnl, g.currency as Currency, mainCurrency, rateMap),
        0
      );
  }, [realizedGains, mainCurrency, rateMap]);
```

- [ ] **Step 4: 在股票板块卡片内添加已实现收益行**

在 `components/AssetOverview.tsx` 中，找到股票板块里显示浮动盈亏的那段 JSX（约第 353 行）：

```tsx
                        <div className={`text-[10px] font-medium tabular-nums ${stockPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {stockPnl >= 0 ? "+" : ""}{formatMoney(stockPnl, mainCurrency)} ({stockPnl >= 0 ? "+" : ""}{stockPnlPct.toFixed(1)}%)
                        </div>
```

在这段 JSX **之后**（仍在同一 `<>` 片段内），添加：

```tsx
                        {stockRealizedPnl !== 0 && (
                          <div className={`text-[10px] tabular-nums mt-0.5 ${stockRealizedPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            已实现 {stockRealizedPnl >= 0 ? "+" : ""}{formatMoney(stockRealizedPnl, mainCurrency)}
                          </div>
                        )}
```

- [ ] **Step 5: 在加密货币汇总卡片内添加已实现收益行**

在 `components/AssetOverview.tsx` 中，找到加密货币汇总卡片（约第 412 行）：

```tsx
                    <div className={`text-xs font-semibold tabular-nums ${totalCryptoValue >= totalCryptoCost ? "text-emerald-600" : "text-red-600"}`}>
                      {totalCryptoValue >= totalCryptoCost ? "+" : ""}{(totalCryptoValue - totalCryptoCost).toFixed(2)}
                    </div>
```

在这段 JSX **之后**（仍在同一 `<div>` 内），添加：

```tsx
                    {cryptoRealizedPnl !== 0 && (
                      <div className={`text-xs tabular-nums mt-0.5 ${cryptoRealizedPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        已实现 {cryptoRealizedPnl >= 0 ? "+" : ""}{formatMoney(cryptoRealizedPnl, mainCurrency)}
                      </div>
                    )}
```

- [ ] **Step 6: 验证构建通过**

```bash
npm run build 2>&1 | tail -20
```

预期：无 TypeScript 错误，build 成功。

- [ ] **Step 7: Commit**

```bash
git add components/AssetOverview.tsx
git commit -m "feat: show realized gains summary in AssetOverview"
```

---

### Task 8: 端到端手动验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 验证清仓写入**

1. 在 /stocks 页面，对任意一个持仓执行「全部卖出」
2. 打开 Supabase Dashboard → Table Editor → `realized_gains`，确认有一条新记录
3. 检查记录的 `symbol`、`cost_basis`、`proceeds`、`realized_pnl`、`realized_pnl_pct`、`closed_at` 字段值正确
4. 确认对应的 `stock_holdings` 记录已被删除
5. 确认关联账户余额正确增加

- [ ] **Step 3: 验证 /stocks 页面展示**

1. 打开 /stocks 页面
2. 在持仓列表下方看到「已实现收益」分隔符
3. 汇总卡片显示「历史总收益 +¥X.XX」
4. 各记录卡片显示 symbol、类型标签、收益金额、收益率、成本/收入/日期

- [ ] **Step 4: 验证 /assets 页面展示**

1. 打开 /assets 页面
2. 股票板块内浮动盈亏下方出现「已实现 +¥X.XX」行
3. 若有加密货币已实现收益，加密板块汇总卡片同样显示

- [ ] **Step 5: 验证加密货币清仓**（若有加密持仓）

对加密货币持仓执行「全部卖出」，验证 `realized_gains` 写入 `asset_type='crypto'`、`currency='USD'`。

- [ ] **Step 6: 验证部分卖出不写入**

对股票持仓执行部分卖出（非全仓），确认 `realized_gains` 表没有新增记录。
