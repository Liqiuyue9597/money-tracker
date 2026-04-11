# 资产组成桑基图（Sankey Chart）设计文档

## 概述

在资产概览页（AssetOverview）新增一个桑基图卡片，展示用户资产的组成结构：左侧按资产类型分类（现金/股票/加密），右侧汇总到总资产和负债，直观展示"我的钱分布在哪些类别"。

灵感来源：有知有行 App 的"资产组成"桑基图。

## 图表库

使用项目已安装的 **recharts 3.x** 内置 `<Sankey>` 组件，零新增依赖。

## 节点设计

共 5~6 个节点（取决于用户是否有 `exclude_from_total` 账户和负债）：

### 左侧节点（资产类型）

| 节点 | 数据来源 | 说明 |
|---|---|---|
| 现金账户 | `accounts` 中 `type=cash`, `balance>=0`, `exclude_from_total=false` 的余额之和（统一换算为 mainCurrency） | 正余额的普通现金账户 |
| 股票投资 | `stockValue`（AssetOverview 已有的 useMemo 计算值，已换算为 mainCurrency） | 股票组合市值 |
| 加密货币 | `totalCryptoValue`（已有的 useMemo 计算值，USD 换算为 mainCurrency） | 加密货币总市值 |
| 🏛 公积金等（可选） | `accounts` 中 `exclude_from_total=true` 的账户余额之和 | 虚线样式，标注"不计入净值"，仅当存在此类账户时才显示 |

### 右侧节点（汇总）

| 节点 | 数据来源 | 说明 |
|---|---|---|
| 总资产 | 现金 + 股票 + 加密的总和 | 仅计入 `exclude_from_total=false` 的资产 |
| 负债 | `accounts` 中 `type=cash`, `balance<0` 的余额绝对值之和（换算为 mainCurrency） | 信用卡等负余额账户，仅当存在负余额账户时才显示 |

### 流向（links）

| source | target | value |
|---|---|---|
| 现金账户 | 总资产 | 正余额现金总额 |
| 股票投资 | 总资产 | 股票市值 |
| 加密货币 | 总资产 | 加密货币市值 |
| （负余额现金） | 负债 | 负余额绝对值之和 |

公积金节点不连入总资产或负债，仅作为独立展示（虚线/浅色样式）。

### 数据结构示例

```typescript
const data = {
  nodes: [
    { name: "现金账户" },    // 0
    { name: "股票投资" },    // 1
    { name: "加密货币" },    // 2
    { name: "总资产" },      // 3
    { name: "负债" },        // 4
    // { name: "公积金" },   // 5 (可选)
  ],
  links: [
    { source: 0, target: 3, value: cashTotal },
    { source: 1, target: 3, value: stockValue },
    { source: 2, target: 3, value: cryptoValueInMainCurrency },
    { source: 0, target: 4, value: Math.abs(debtTotal) },
  ],
};
```

## 节点显示信息

每个节点显示：
- **名称**（如"现金账户"）
- **金额**（如 ¥396,869）
- **占比**（如 45%，占总资产的百分比）

图表底部一行小字：**净资产 ¥xxx · 负债率 x.x%**

负债率公式：`负债 / 总资产 × 100%`

## 视觉样式

- 各资产类型使用不同颜色：
  - 现金：蓝色系（#60a5fa）
  - 股票：绿色系（#34d399）
  - 加密：黄色系（#fbbf24）
  - 公积金：灰色系（#94a3b8），虚线边框
  - 总资产：紫色系（#818cf8）
  - 负债：红色系（#f87171）
- 公积金节点：虚线/浅色样式 + "不计入净值"标注
- 整体风格：与现有 shadcn/ui 卡片风格一致（圆角、shadow-sm、border-0）

## 页面位置

在 AssetOverview 组件中，放在**总净值卡片下方、现金账户列表上方**。

包裹在一个 Card 中，标题为"资产组成"。

## 边界情况处理

- **没有某类资产**：该节点不显示（如无股票则不显示股票节点）
- **没有负债**：不显示负债节点
- **没有 exclude_from_total 账户**：不显示公积金节点
- **所有资产为 0**：不渲染桑基图卡片
- **只有一类资产**：仍然显示桑基图（一条流向），但可考虑 fallback 为简单文字
- **金额为 0 的节点**：recharts Sankey 不支持 value=0 的 link，需过滤掉

## 多币种处理

所有金额在计算前统一通过 `convertCurrency()` 换算为 `mainCurrency`，与现有的 totalNetWorth 计算逻辑一致。

## 实现范围

- 新建 `components/AssetSankey.tsx` 组件
- 在 `AssetOverview.tsx` 中引入并放置于净值卡片下方
- 所有数据从 AssetOverview 已有的 state/memo 传入，不需要新增 API 调用或数据库查询

## 不包含的内容

- 不做月度资产变化对比（截图中间那个条形图部分）
- 不做三层桑基图（不展开到具体账户/个股级别）
- 不做点击交互（点击节点跳转等）
