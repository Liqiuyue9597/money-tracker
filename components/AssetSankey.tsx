"use client";

import { useMemo } from "react";
import { Sankey, Tooltip, Layer, Rectangle } from "recharts";
import type { NodeProps as SankeyNodeProps, LinkProps as SankeyLinkProps } from "recharts/types/chart/Sankey";
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

// Shape of the payload object Recharts injects into custom node/link/tooltip renderers
interface SankeyNodePayload {
  name: string;
  isExcluded?: boolean;
}

interface SankeyLinkPayload {
  source: SankeyNodePayload;
  target: SankeyNodePayload;
  value: number;
}

function CustomNode(props: SankeyNodeProps) {
  const { x, y, width, height, index, payload } = props;
  const { name = "", isExcluded = false } = (payload as SankeyNodePayload) ?? {};
  const color = NODE_COLORS[name] || "#94a3b8";
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
        radius={4}
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

function CustomLink(props: SankeyLinkProps) {
  const {
    sourceX,
    sourceY,
    sourceControlX,
    targetX,
    targetY,
    targetControlX,
    linkWidth,
    payload,
  } = props;

  const { source, target } = payload as SankeyLinkPayload;
  const sourceName = source.name;
  const targetName = target.name;
  const sourceColor = NODE_COLORS[sourceName] || "#94a3b8";
  const targetColor = NODE_COLORS[targetName] || "#818cf8";
  const isDebt = targetName === "负债";
  const gradientId = `link-${sourceName}-${targetName}`;

  return (
    <Layer>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
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
        fill={`url(#${gradientId})`}
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
  const { nodes, links, netWorth, debtRatio } = useMemo(() => {
    const nodeList: { name: string; isExcluded?: boolean }[] = [];
    const linkList: { source: number; target: number; value: number }[] = [];

    // Build left-side nodes (only if value > 0)
    if (cashTotal > 0) nodeList.push({ name: "现金账户" });
    if (stockValue > 0) nodeList.push({ name: "股票投资" });
    if (cryptoValue > 0) nodeList.push({ name: "加密货币" });

    const leftCount = nodeList.length;
    if (leftCount === 0) {
      return { nodes: [], links: [], netWorth: 0, debtRatio: 0 };
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

    // Debt link: from 现金账户 → 负债 (only when cash node exists)
    if (debtTotal > 0 && debtIdx >= 0) {
      const cashNodeIdx = nodeList.findIndex((n) => n.name === "现金账户");
      if (cashNodeIdx >= 0) {
        linkList.push({ source: cashNodeIdx, target: debtIdx, value: debtTotal });
      }
      // If no cash node, skip the debt link entirely rather than linking from an unrelated node
    }

    // Excluded accounts need a link to show in Sankey
    // (Sankey rendering constraint: all nodes must participate in links — not a real financial relationship)
    if (excludedTotal > 0 && excludedIdx >= 0) {
      linkList.push({ source: excludedIdx, target: totalAssetsIdx, value: excludedTotal });
    }

    const total = cashTotal + stockValue + cryptoValue;
    const net = total - debtTotal;
    const ratio = total > 0 ? (debtTotal / total) * 100 : 0;

    return { nodes: nodeList, links: linkList, netWorth: net, debtRatio: ratio };
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
          node={CustomNode}
          link={CustomLink}
          nodeWidth={14}
          nodePadding={16}
          linkCurvature={0.5}
          iterations={32}
          margin={{ top: 8, right: 80, bottom: 8, left: 80 }}
        >
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const item = payload[0]?.payload as (SankeyNodePayload & { value?: number }) & Partial<SankeyLinkPayload> | undefined;
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
          净资产{" "}
          <span className="font-semibold text-foreground">
            {formatMoney(netWorth, mainCurrency)}
          </span>
          {debtRatio > 0 && (
            <span className="ml-3">
              负债率{" "}
              <span className="font-semibold text-foreground">
                {debtRatio.toFixed(1)}%
              </span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
