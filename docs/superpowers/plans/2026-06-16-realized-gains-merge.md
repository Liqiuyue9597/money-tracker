# 已实现收益按标的合并展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `RealizedGainsList` 中按 `symbol + asset_type` 合并已实现收益记录，多笔合并为一张卡片，并在卡片底部和顶部汇总卡显示笔数信息。

**Architecture:** 纯前端展示层改动。从 `useRealizedGains` 拿到的原始数组，在组件内通过 `useMemo` 按 `symbol + asset_type` 分组聚合（累加金额，根据累计值重算百分比），然后渲染合并后的卡片。数据库、SWR hook、类型定义全部不动。

**Tech Stack:** Next.js 16、TypeScript、SWR、Tailwind CSS / shadcn-ui

---

## File Map

| 文件 | 操作 | 说明 |
|------|------|------|
| `components/RealizedGainsList.tsx` | 修改 | 加入聚合逻辑 + 卡片底部"共 N 笔" + 顶部汇总卡新文案 |

唯一改动文件。

---

## Task 1: 添加聚合逻辑

**Files:**
- Modify: `components/RealizedGainsList.tsx`

- [ ] **Step 1: 在文件顶部增加合并后类型定义和聚合函数**

打开 `/Users/elissali/github/money-tracker/components/RealizedGainsList.tsx`。

在 `getAssetTypeLabel` 函数下方（约第 18 行之后，`export function RealizedGainsList()` 之前）插入：

```typescript
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
```

**为什么写成接受 `cost_basis: number | string`：** Supabase 的 `numeric` 字段在 JS 端有时返回字符串，原代码已经用 `Number(g.cost_basis)` 处理过，保留这个习惯避免类型断言失败。

- [ ] **Step 2: 在组件内调用 mergeGains 生成合并后数组**

在 `RealizedGainsList` 函数体内，紧跟 `const rateMap = rates?.rates;`（约第 24 行）之后插入：

```typescript
  const merged = useMemo(() => mergeGains(gains), [gains]);
  const isAggregated = merged.length !== gains.length;
```

- [ ] **Step 3: 验证类型检查通过**

运行：

```bash
cd /Users/elissali/github/money-tracker && npx tsc --noEmit
```

预期：无报错。如有 import 报错，把 `useMemo` 已在第 3 行 import，不需要新增。

- [ ] **Step 4: 提交**

```bash
git add components/RealizedGainsList.tsx
git commit -m "$(cat <<'EOF'
feat(realized-gains): aggregate same-symbol records (logic only)

Adds mergeGains() that groups RealizedGain records by asset_type+symbol,
sums cost_basis/proceeds/realized_pnl, and recomputes realized_pnl_pct
from cumulative totals. UI not yet updated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 用合并后的数据渲染卡片，并在底部加"共 N 笔"

**Files:**
- Modify: `components/RealizedGainsList.tsx`

- [ ] **Step 1: 替换卡片列表的迭代源 `gains.map` 为 `merged.map`，并调整字段访问**

找到 `{/* Individual records */}` 注释下方的 `<div className="space-y-2">`（约第 79 行起）。

替换 `{gains.map((g) => {` 这一段直到对应的结束 `})}` 为下面的版本（注意 `g.id` 现在是合并后那一组的代表 id，仍可作为 React key）：

```tsx
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
```

**关键差异（相对原代码）：**
- `gains.map` → `merged.map`
- 成本/收入字段无需 `Number(g.cost_basis)` 包裹（`MergedGain` 中已是 number）
- 日期字段 `g.closed_at` → `g.latest_closed_at`
- 在日期之后追加 `g.count > 1` 时显示的"共 N 笔"

- [ ] **Step 2: 验证类型检查通过**

```bash
cd /Users/elissali/github/money-tracker && npx tsc --noEmit
```

预期：无报错。

- [ ] **Step 3: 启动本地开发服务器手动验证**

```bash
cd /Users/elissali/github/money-tracker && npm run dev
```

打开 http://localhost:3000/assets （或 /stocks 也包含此组件）。重点检查：

1. **基金 `000979`**（数据库中有 2 条卖出）：应只显示 1 张卡片，金额应等于两笔之和（成本 ≈ ¥17272.28，收入 ≈ ¥23913.84，盈亏 ≈ +¥6641.56），日期显示 `2026-06-15`，meta 行末尾显示"共 2 笔"。
2. **港股 `07709.HK`**（有 2 条）：应只显示 1 张卡片，meta 行末尾显示"共 2 笔"。
3. **`COIN`、`DRAM`、`01810.HK`** 等只卖过一次的标的：卡片显示与改动前完全一致，meta 行末尾**不**显示"共 X 笔"。
4. **百分比正确**：基金 `000979` 合并后的百分比应为 `(1966.11 + 4675.45) / (5564.89 + 11707.39) × 100 ≈ 38.45%`。
5. **样式无破坏**：meta 行换行、对齐、间距与原版一致。

按 Ctrl+C 关闭 dev server。

- [ ] **Step 4: 提交**

```bash
git add components/RealizedGainsList.tsx
git commit -m "$(cat <<'EOF'
feat(realized-gains): render merged cards with sell count badge

RealizedGainsList now iterates over merged groups; each card shows
cumulative cost / proceeds / pnl, the latest closed_at, and a
"共 N 笔" suffix when count > 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 更新顶部汇总卡的笔数文案

**Files:**
- Modify: `components/RealizedGainsList.tsx`

- [ ] **Step 1: 替换顶部汇总卡中的 `共 {gains.length} 笔`**

找到顶部 Summary card 区块（约第 60-76 行），定位这一行：

```tsx
            <div className="text-xs text-muted-foreground mt-0.5">共 {gains.length} 笔</div>
```

替换为：

```tsx
            <div className="text-xs text-muted-foreground mt-0.5">
              {isAggregated
                ? `${merged.length} 个标的 · 共 ${gains.length} 笔卖出`
                : `共 ${gains.length} 笔`}
            </div>
```

`isAggregated` 已在 Task 1 Step 2 定义。

- [ ] **Step 2: 验证类型检查通过**

```bash
cd /Users/elissali/github/money-tracker && npx tsc --noEmit
```

预期：无报错。

- [ ] **Step 3: 启动本地开发服务器手动验证**

```bash
cd /Users/elissali/github/money-tracker && npm run dev
```

打开 http://localhost:3000/assets，检查顶部"已实现收益"汇总卡：

1. 由于当前数据中存在合并（`000979` × 2、`07709.HK` × 2），应显示形如 `X 个标的 · 共 12 笔卖出`（具体数字取决于真实数据）。
2. **总收益数字（`totalPnl`）应保持不变** —— 与改动前完全相同的数值，颜色（红/绿）与符号（+/−）也不变。

按 Ctrl+C 关闭 dev server。

- [ ] **Step 4: 运行项目构建确认生产构建可通过**

```bash
cd /Users/elissali/github/money-tracker && npm run build
```

预期：构建成功，无 TypeScript 错误，无 ESLint 致命错误。

- [ ] **Step 5: 提交**

```bash
git add components/RealizedGainsList.tsx
git commit -m "$(cat <<'EOF'
feat(realized-gains): show distinct-symbol count in summary card

When multiple sells of the same symbol are merged, the top summary
card now shows "X 个标的 · 共 N 笔卖出"; otherwise it falls back to
the original "共 N 笔" wording.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec 要求 | 对应任务 |
|---|---|
| 按 `symbol + asset_type` 分组合并 | Task 1 Step 1（`mergeGains` 使用 `${g.asset_type}:${g.symbol}` 作为 key） |
| `cost_basis / proceeds / realized_pnl` 累加 | Task 1 Step 1 |
| `realized_pnl_pct` 用累计值重算（不是平均） | Task 1 Step 1（`existing.realized_pnl / existing.cost_basis * 100`） |
| `name / currency` 取最新一条 | Task 1 Step 1（首次遇到即最新，因输入按 `closed_at desc`） |
| 按 `latest_closed_at` 降序排列 | Task 1 Step 1（结尾的 `.sort`） |
| 卡片底部"共 N 笔"（仅 count > 1 时） | Task 2 Step 1（`{g.count > 1 && ...}`） |
| 日期显示 `latest_closed_at` | Task 2 Step 1 |
| 单笔时卡片与现状完全一致 | Task 2 Step 1（仅在 count > 1 时追加"共 N 笔"） |
| 顶部汇总卡有合并时新文案 | Task 3 Step 1 |
| 顶部汇总卡无合并时保持原状 | Task 3 Step 1（`isAggregated` 三元分支） |
| `totalPnl` 计算不变 | 未改动该段代码（继续遍历原始 `gains` 数组） |
| 不修改数据库、不修改 SWR hook、不修改类型 | File Map 仅含一个文件 |

无遗漏。

**Placeholder scan:** 无 TBD/TODO，所有代码块完整。

**Type consistency:** `MergedGain.cost_basis / proceeds / realized_pnl / realized_pnl_pct / count` 在 Task 2 渲染时直接当 `number` 用（`.toFixed`），与 Task 1 中的类型定义匹配。`latest_closed_at: string` 在 Task 2 用 `.slice(0, 10)`，与 `closed_at` 的字符串格式（`"2026-06-15"` 或 `"2026-06-15T..."`）兼容。

---

Plan 写完。
