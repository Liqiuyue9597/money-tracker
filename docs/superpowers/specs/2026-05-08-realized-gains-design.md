# 已实现收益功能设计

## 概述

当用户卖出（清仓）股票、基金或加密货币后，持仓记录会被删除，收益数据随之丢失。本功能新增「已实现收益」记录，在清仓时自动保存每笔投资的盈亏数据，并在以下两处展示：

- **投资组合页面**（/stocks）：已实现收益历史列表，按股票代码汇总
- **资产总览页面**（/assets）：股票板块和加密货币板块各增加一行汇总数字

## 需求摘要

| 需求 | 决策 |
|------|------|
| 触发时机 | 仅清仓（全部卖出）时记录，部分卖出不记录 |
| 记录粒度 | 按 symbol 汇总，不保留每次交易明细 |
| 展示位置 | 投资组合页列表 + 资产总览页汇总数字 |
| 币种处理 | 记录保留原始币种；汇总时按 mainCurrency 换算 |
| 手动删除持仓 | 不写入 realized_gains，数据丢失由用户承担 |

## 数据层

### 新表：`realized_gains`

```sql
CREATE TABLE public.realized_gains (
  id               uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id          uuid NOT NULL REFERENCES auth.users(id),
  symbol           text NOT NULL,
  name             text NOT NULL DEFAULT '',
  asset_type       text NOT NULL CHECK (asset_type IN ('us', 'hk', 'fund', 'crypto')),
  currency         text NOT NULL CHECK (currency IN ('CNY', 'USD', 'HKD')),
  cost_basis       numeric NOT NULL,   -- 总成本 = 买入均价 × 数量
  proceeds         numeric NOT NULL,   -- 总收入 = 卖出价 × 数量
  realized_pnl     numeric NOT NULL,   -- 已实现收益 = proceeds - cost_basis
  realized_pnl_pct numeric NOT NULL,   -- 收益率 = realized_pnl / cost_basis × 100
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

### 卖出 RPC 改造

改造 `sell_all_holding`（股票/基金）和 `sell_all_crypto`（加密货币）两个现有 RPC。

**改造前**：清仓 → 删除 holding → 更新账户余额

**改造后**（在同一事务内）：
1. 从 holding 表读取当前 `buy_price`、`quantity`、`name`、`currency`、`asset_type`
2. 计算 `cost_basis = buy_price × quantity`，`proceeds = sell_price × quantity`，`realized_pnl`，`realized_pnl_pct`
3. INSERT INTO realized_gains
4. DELETE holding 记录
5. UPDATE accounts.balance += receive_amount

全部在一个事务内，任意步骤失败则整体回滚。

**前端无需传递额外参数**，所需数据由 RPC 从数据库读取计算。

## UI 设计

### 投资组合页面（/stocks）

在现有持仓列表下方新增「已实现收益」板块（无持仓时也显示，只要有已实现记录）：

```
────────────── 已实现收益 ──────────────

┌─────────────────────────────────────┐
│  历史总收益          +¥8,200         │  汇总卡片（按 mainCurrency 换算）
│  共 5 笔                            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  AAPL  美股              +$1,200    │
│  Apple Inc.            +15.3%      │
│  成本 $8,200  收入 $9,400  2025/03/12│
└─────────────────────────────────────┘
```

- 收益为正 → `text-emerald-600`；亏损 → `text-red-600`
- 按 `closed_at` 倒序（最近清仓在最上方）
- **无记录时**：整个板块不渲染

### 资产总览页面（/assets）

在股票板块和加密货币板块各增加一行，紧跟浮动盈亏之后：

```
┌─────────────────────────────────────┐
│  📈 股票 & 基金                       │
│  持仓市值      ¥XX,XXX               │
│  浮动盈亏      +¥X,XXX (+5.2%)      │
│  已实现收益    +¥8,200            →  │  ← 新增，点击跳转 /stocks
└─────────────────────────────────────┘
```

- 按 mainCurrency 换算后显示汇总数字
- 点击跳转至 /stocks 页面
- **无记录时**：该行不渲染

## 新增 SWR Hook

在 `lib/swr-hooks.ts` 新增：

```ts
export function useRealizedGains(userId?: string) {
  return useSWR(
    userId ? ["realized_gains", userId] : null,
    () =>
      supabase
        .from("realized_gains")
        .select("*")
        .eq("user_id", userId!)
        .order("closed_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return data ?? [];
        })
  );
}
```

## 类型定义

在 `lib/supabase.ts` 新增：

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

## 边界情况与错误处理

| 场景 | 处理方式 |
|------|---------|
| 部分卖出（非清仓）| 不写 realized_gains，行为与现有一致 |
| 清仓 RPC 内写入失败 | 整个事务回滚，holding 不删除，账户余额不变，前端 toast.error |
| 直接删除持仓（非卖出）| 不写 realized_gains，数据丢失由用户承担 |
| realized_gains 加载失败 | 板块显示"加载失败"提示，不影响持仓区域正常展示 |
| 无已实现记录 | 投资组合页不渲染该板块；资产总览页不显示该行 |
| 跨币种汇总 | 各记录保留原始币种；汇总数字按 mainCurrency 换算后相加，复用现有 `convertCurrency` |

## 不做的事情

- **不记录部分卖出**：只有清仓才写入，减少数据复杂度
- **不支持手动新增/编辑已实现收益记录**：数据由系统在清仓时自动生成
- **不支持删除已实现收益记录**：防止误操作抹去历史
- **不做持有天数统计**：当前版本不展示，但表结构支持未来计算（buy_date 在 holding 表，closed_at 在 realized_gains 表）
