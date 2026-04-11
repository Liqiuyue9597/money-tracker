# Asset Sankey Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sankey diagram to the asset overview page showing asset composition (cash/stock/crypto → total assets + liabilities) with special handling for excluded accounts like 公积金.

**Architecture:** A new `AssetSankey` component uses recharts `<Sankey>` to render a flow diagram. It receives pre-computed values from `AssetOverview` as props (no new API calls). The component builds its own `nodes`/`links` data structure, filters out zero-value categories, and renders inside a Card below the net worth card.

**Tech Stack:** recharts `<Sankey>` (already installed), React, TypeScript, Tailwind CSS, shadcn/ui Card

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `components/AssetSankey.tsx` | Create | Sankey chart component — receives asset values as props, builds nodes/links, renders chart |
| `components/AssetOverview.tsx` | Modify (lines ~87-97, ~164) | Compute additional derived values (cashTotal, debtTotal, excludedTotal), pass to AssetSankey, render it below net worth card |

---

### Task 1: Create AssetSankey Component

**Files:**
- Create: `components/AssetSankey.tsx`

- [ ] **Step 1: Create the AssetSankey component with props interface and data building logic**

```tsx
"use client";

import { useMemo } from "react";
import { Sankey, Tooltip, Layer, Rectangle } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, type Currency } from "@/lib/supabase";

interface AssetSankeyProps {
  cashTotal: number;       // positive-balance cash accounts (excl. exclude_from_total)
  stockValue: number;      // stock portfolio value in mainCurrency
  cryptoValue: number;     // crypto value in mainCurrency
  debtTotal: number;       // absolute value of negative-balance cash accounts
  excludedTotal: number;   // exclude_from_total accounts (e.g. 公积金)
  mainCurrency: Currency;
}

// Colors for each node type
const NODE_COLORS: Record<string, string> = {
  "现金账户": "#60a5fa",
  "股票投资": "#34d399",
  "加密货币": "#fbbf24",
  "公积金等": "#94a3b8",
  "总资产":   "#818cf8",
  "负债":     "#f87171",
};

function CustomNode({
  x,
  y,
  width,
  height,
  index,
  payload,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: { name: string; value: number; isExcluded?: boolean };
}) {
  const name = payload.name;
  const color = NODE_COLORS[name] || "#94a3b8";
  const isExcluded = payload.isExcluded === true;
  const isRight = name === "总资产" || name === "负债";

  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isExcluded ? "none" : color}
        stroke={isExcluded ? color : "none"}
        strokeWidth={isExcluded ? 1.5 : 0}
        strokeDasharray={isExcluded ? "4 3" : undefined}
        radius={[4, 4, 4, 4]}
      />
      <text
        x={isRight ? x + width + 8 : x - 8}
        y={y + height / 2 - 6}
        textAnchor={isRight ? "start" : "end"}
        fontSize={11}
        fontWeight={600}
        fill="#333"
      >
        {name}
      </text>
      <text
        x={isRight ? x + width + 8 : x - 8}
        y={y + height / 2 + 10}
        textAnchor={isRight ? "start" : "end"}
        fontSize={9}
        fill="#888"
      >
        {isExcluded ? "不计入净值" : ""}
      </text>
    </Layer>
  );
}

function CustomLink({
  sourceX,
  sourceY,
  sourceControlX,
  targetX,
  targetY,
  targetControlX,
  linkWidth,
  payload,
}: {
  sourceX: number;
  sourceY: number;
  sourceControlX: number;
  targetX: number;
  targetY: number;
  targetControlX: number;
  linkWidth: number;
  payload: { source: { name: string }; target: { name: string } };
}) {
  const sourceName = payload.source?.name;
  const targetName = payload.target?.name;
  const sourceColor = NODE_COLORS[sourceName] || "#94a3b8";
  const targetColor = NODE_COLORS[targetName] || "#818cf8";
  const isDebt = targetName === "负债";

  return (
    <Layer>
      <defs>
        <linearGradient
          id={`link-${sourceName}-${targetName}`}
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <stop offset="0%" stopColor={sourceColor} stopOpacity={0.4} />
          <stop
            offset="100%"
            stopColor={isDebt ? "#f87171" : targetColor}
            stopOpacity={0.2}
          />
        </linearGradient>
      </defs>
      <path
        d={`
          M${sourceX},${sourceY + linkWidth / 2}
          C${sourceControlX},${sourceY + linkWidth / 2}
            ${targetControlX},${targetY + linkWidth / 2}
            ${targetX},${targetY + linkWidth / 2}
          L${targetX},${targetY - linkWidth / 2}
          C${targetControlX},${targetY - linkWidth / 2}
            ${sourceControlX},${sourceY - linkWidth / 2}
            ${sourceX},${sourceY - linkWidth / 2}
          Z
        `}
        fill={`url(#link-${sourceName}-${targetName})`}
        strokeWidth={0}
      />
    </Layer>
  );
}

export function AssetSankey({
  cashTotal,
  stockValue,
  cryptoValue,
  debtTotal,
  excludedTotal,
  mainCurrency,
}: AssetSankeyProps) {
  const { nodes, links, totalAssets, netWorth, debtRatio } = useMemo(() => {
    const nodeList: { name: string; isExcluded?: boolean }[] = [];
    const linkList: { source: number; target: number; value: number }[] = [];

    // Build left-side nodes (only if value > 0)
    if (cashTotal > 0) nodeList.push({ name: "现金账户" });
    if (stockValue > 0) nodeList.push({ name: "股票投资" });
    if (cryptoValue > 0) nodeList.push({ name: "加密货币" });

    const leftCount = nodeList.length;
    if (leftCount === 0) {
      return { nodes: [], links: [], totalAssets: 0, netWorth: 0, debtRatio: 0 };
    }

    // Right-side: always add 总资产
    const totalAssetsIdx = nodeList.length;
    nodeList.push({ name: "总资产" });

    // Right-side: add 负债 only if exists
    let debtIdx = -1;
    if (debtTotal > 0) {
      debtIdx = nodeList.length;
      nodeList.push({ name: "负债" });
    }

    // Left-side: add excluded accounts after right-side nodes
    let excludedIdx = -1;
    if (excludedTotal > 0) {
      excludedIdx = nodeList.length;
      nodeList.push({ name: "公积金等", isExcluded: true });
    }

    // Build links: each left node → 总资产
    let linkIdx = 0;
    if (cashTotal > 0) {
      linkList.push({ source: linkIdx, target: totalAssetsIdx, value: cashTotal });
      linkIdx++;
    }
    if (stockValue > 0) {
      linkList.push({ source: linkIdx, target: totalAssetsIdx, value: stockValue });
      linkIdx++;
    }
    if (cryptoValue > 0) {
      linkList.push({ source: linkIdx, target: totalAssetsIdx, value: cryptoValue });
      linkIdx++;
    }

    // Debt link
    if (debtTotal > 0 && debtIdx >= 0) {
      // Use source 0 (first left node) for the debt flow visually
      // But actually we need a dedicated source. Since debt comes from negative cash accounts,
      // we create a small "hack": add debt value to the first available node's flow to 负债.
      // Recharts Sankey requires each link to have a valid source node.
      // Best approach: link from the 现金账户 node (index 0 if it exists) to 负债.
      const cashNodeIdx = nodeList.findIndex((n) => n.name === "现金账户");
      if (cashNodeIdx >= 0) {
        linkList.push({ source: cashNodeIdx, target: debtIdx, value: debtTotal });
      } else {
        // If no cash node, create a minimal link from first node
        linkList.push({ source: 0, target: debtIdx, value: debtTotal });
      }
    }

    // Excluded link: 公积金 needs a link to show up in Sankey.
    // We link it to 总资产 with a minimal value so it appears, but visually it's styled differently.
    // Actually, Sankey requires all nodes to participate in links. We'll link excluded → 总资产
    // with its actual value but style the link as dashed/faint.
    if (excludedTotal > 0 && excludedIdx >= 0) {
      linkList.push({ source: excludedIdx, target: totalAssetsIdx, value: excludedTotal });
    }

    const total = cashTotal + stockValue + cryptoValue;
    const net = total - debtTotal;
    const ratio = total > 0 ? (debtTotal / total) * 100 : 0;

    return { nodes: nodeList, links: linkList, totalAssets: total, netWorth: net, debtRatio: ratio };
  }, [cashTotal, stockValue, cryptoValue, debtTotal, excludedTotal]);

  // Don't render if no meaningful data
  if (nodes.length === 0 || links.length === 0) {
    return null;
  }

  return (
    <Card className="mb-4 border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="text-sm font-medium mb-3">资产组成</div>
        <Sankey
          width={360}
          height={Math.max(200, nodes.length * 45)}
          data={{ nodes, links }}
          node={<CustomNode x={0} y={0} width={0} height={0} index={0} payload={{ name: "", value: 0 }} />}
          link={<CustomLink sourceX={0} sourceY={0} sourceControlX={0} targetX={0} targetY={0} targetControlX={0} linkWidth={0} payload={{ source: { name: "" }, target: { name: "" } }} />}
          nodeWidth={14}
          nodePadding={16}
          linkCurvature={0.5}
          iterations={32}
          margin={{ top: 8, right: 80, bottom: 8, left: 80 }}
        >
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const item = payload[0]?.payload;
              if (!item) return null;
              const name = item.name || `${item.source?.name} → ${item.target?.name}`;
              const value = item.value ?? 0;
              return (
                <div className="rounded-lg bg-white/95 backdrop-blur px-3 py-2 shadow-lg border text-xs">
                  <div className="font-medium">{name}</div>
                  <div className="text-muted-foreground tabular-nums">
                    {formatMoney(value, mainCurrency)}
                  </div>
                </div>
              );
            }}
          />
        </Sankey>
        <div className="text-center text-[11px] text-muted-foreground mt-1 tabular-nums">
          净资产 <span className="font-semibold text-foreground">{formatMoney(netWorth, mainCurrency)}</span>
          {debtRatio > 0 && (
            <span className="ml-3">
              负债率 <span className="font-semibold text-foreground">{debtRatio.toFixed(1)}%</span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors related to `AssetSankey.tsx`. There may be pre-existing errors in other files — ignore those.

- [ ] **Step 3: Commit**

```bash
git add components/AssetSankey.tsx
git commit -m "feat: add AssetSankey component with recharts Sankey chart"
```

---

### Task 2: Integrate AssetSankey into AssetOverview

**Files:**
- Modify: `components/AssetOverview.tsx` (add derived values + render AssetSankey)

- [ ] **Step 1: Add import for AssetSankey at the top of AssetOverview.tsx**

After the existing import of `AccountManager`, add:

```typescript
import { AssetSankey } from "@/components/AssetSankey";
```

- [ ] **Step 2: Add derived values for the Sankey chart**

In `AssetOverview`, after the existing `totalNetWorth` useMemo block (around line 97), add a new useMemo for Sankey-specific values:

```typescript
  // Sankey chart derived values
  const { cashTotal, debtTotal, excludedTotal, cryptoValueInMain } = useMemo(() => {
    let cash = 0;
    let debt = 0;
    let excluded = 0;
    for (const acc of accounts) {
      if (acc.type !== "cash") continue;
      const bal = convertCurrency(Number(acc.balance), acc.currency, mainCurrency, rateMap);
      if (acc.exclude_from_total) {
        excluded += Math.abs(bal);
      } else if (bal >= 0) {
        cash += bal;
      } else {
        debt += Math.abs(bal);
      }
    }
    const cryptoMain = totalCryptoValue > 0
      ? convertCurrency(totalCryptoValue, "USD", mainCurrency, rateMap)
      : 0;
    return { cashTotal: cash, debtTotal: debt, excludedTotal: excluded, cryptoValueInMain: cryptoMain };
  }, [accounts, mainCurrency, rateMap, totalCryptoValue]);
```

- [ ] **Step 3: Render AssetSankey below the net worth card**

In the JSX, after the Total card closing `</Card>` (around line 164), add:

```tsx
      {/* Asset Composition Sankey */}
      <AssetSankey
        cashTotal={cashTotal}
        stockValue={stockValue}
        cryptoValue={cryptoValueInMain}
        debtTotal={debtTotal}
        excludedTotal={excludedTotal}
        mainCurrency={mainCurrency}
      />
```

- [ ] **Step 4: Verify it compiles and the dev server renders correctly**

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit 2>&1 | head -30`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add components/AssetOverview.tsx
git commit -m "feat: integrate AssetSankey into asset overview page"
```

---

### Task 3: Visual Polish and Edge Case Handling

**Files:**
- Modify: `components/AssetSankey.tsx`

- [ ] **Step 1: Make the chart responsive to container width**

Replace the hardcoded `width={360}` in the `<Sankey>` with a responsive approach. Wrap the Sankey in a div with a ref and use it for width:

At the top of the `AssetSankey` function, add:

```typescript
import { useState, useMemo, useRef, useEffect } from "react";
```

(Update the existing `useMemo` import line to include `useState`, `useRef`, `useEffect`.)

Then inside the component, before the `useMemo` for nodes/links, add:

```typescript
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(360);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
```

Then in the JSX, wrap the `<Sankey>` with:

```tsx
        <div ref={containerRef}>
          <Sankey
            width={chartWidth}
            height={Math.max(200, nodes.length * 45)}
            ...
```

- [ ] **Step 2: Test edge case — user with only cash accounts (no stock/crypto)**

Manually verify by thinking through the logic:
- `stockValue=0`, `cryptoValue=0` → those nodes and links are skipped
- Only `现金账户 → 总资产` link renders
- Chart still renders correctly with 2 nodes

Run: `cd /Users/elissali/github/money-tracker && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors.

- [ ] **Step 3: Test edge case — all values zero**

When `cashTotal=0`, `stockValue=0`, `cryptoValue=0`:
- `nodes.length === 0` → early return `null`
- Component renders nothing — no empty card shown ✓

- [ ] **Step 4: Commit**

```bash
git add components/AssetSankey.tsx
git commit -m "fix: make AssetSankey responsive and handle edge cases"
```

---

### Task 4: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `cd /Users/elissali/github/money-tracker && npm run build 2>&1 | tail -30`

Expected: Build succeeds. If there are pre-existing warnings, that's fine — just ensure no new errors from our changes.

- [ ] **Step 2: Visual check**

Run: `cd /Users/elissali/github/money-tracker && npm run dev`

Open `http://localhost:3000/assets` in the browser and verify:
1. Net worth card still shows at top
2. Sankey chart card appears below it with title "资产组成"
3. Left nodes show asset types with correct colors
4. Right nodes show 总资产 and (if applicable) 负债
5. Flows connect correctly
6. Bottom line shows 净资产 and 负债率
7. Tooltip appears on hover with formatted amounts
8. If user has exclude_from_total accounts (公积金), it shows as a dashed node

- [ ] **Step 3: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: address visual issues from build verification"
```

Only run this if Step 2 revealed issues that needed fixing.
