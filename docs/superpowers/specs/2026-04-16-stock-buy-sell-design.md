# 股票/基金/加密货币买入卖出功能设计

## 概述

为投资组合页面（StockPortfolio）和资产总览页面（AssetOverview 的加密货币部分）添加买入（加仓）和卖出（减仓）功能。用户可以在持仓卡片上操作，系统自动更新持仓数量、成本价以及关联现金账户余额。不保留交易历史记录。

涉及两类资产，交互模式一致：
- **股票/基金**：在 StockPortfolio 组件中操作，数据表为 `stock_holdings`
- **加密货币**：在 AssetOverview 组件的加密货币区域操作，数据表为 `crypto_holdings`

## 需求摘要

| 需求 | 决策 |
|------|------|
| 交互入口 | 点击持仓卡片展开详情，在详情区域提供买入/卖出按钮 |
| 买入成本计算 | 自动计算加权平均成本，保留手动修正能力 |
| 资金流向 | 买入关联扣款账户，卖出关联收款账户 |
| 账户余额 | 买入/卖出自动更新关联现金账户余额 |
| 清仓处理 | 全部卖出后自动删除持仓记录 |
| 交易历史 | 不需要，不写入 stock_transactions 表 |

## 交互设计

### 1. 持仓卡片展开

**收起状态（默认）：** 保持现有卡片样式不变，增加一个展开指示符（`›`）。

**展开状态（点击后）：** 卡片底部出现操作栏，包含 4 个按钮：
- **买入**（黑色实心按钮，主操作）
- **卖出**（白色描边按钮）
- **编辑**（图标按钮 ✏️，替代现有的编辑入口）
- **删除**（图标按钮 🗑️，替代现有的删除入口）

展开/收起使用动画过渡。同一时间只展开一个卡片（手风琴模式）。

### 2. 买入对话框

点击「买入」按钮弹出 Dialog，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| 买入数量 | number input | 必填，> 0 |
| 买入单价 | number input | 必填，> 0，单位为持仓币种 |
| 扣款账户 | select dropdown | 必填，从用户现金账户列表中选择，显示账户名 + 当前余额 |

**预览区域**（实时计算，用户输入时自动更新）：
- 新总数量 = 原数量 + 买入数量
- 加权平均成本 = (原数量 × 原成本 + 买入数量 × 买入单价) ÷ 新总数量
- 扣款金额 = 买入数量 × 买入单价（红色显示）
- 账户剩余余额 = 原余额 - 扣款金额

**底部提示：** "确认后可手动修改成本价"

### 3. 卖出对话框

点击「卖出」按钮弹出 Dialog，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| 卖出数量 | number input | 必填，> 0，≤ 当前持仓数量 |
| 卖出单价 | number input | 必填，> 0，单位为持仓币种 |
| 收款账户 | select dropdown | 必填，从用户现金账户列表中选择，显示账户名 + 当前余额 |

**快捷操作：** "全部卖出" 链接，点击后自动填入当前全部持仓数量。

**预览区域：**
- 剩余数量 = 原数量 - 卖出数量
- 成本价 = 原成本（不变）
- 收款金额 = 卖出数量 × 卖出单价（绿色显示）
- 账户更新后余额 = 原余额 + 收款金额

**全部卖出警告：** 当卖出数量 = 全部持仓时，显示提示 "确认后将自动删除该持仓记录，收款到选定账户"。

## 数据操作

以下操作对 stock_holdings 和 crypto_holdings 通用，区别仅在于表名。

### 买入

一次操作同时更新两条记录（应在同一逻辑中顺序执行）：

1. **更新 stock_holdings / crypto_holdings：**
   - `quantity` = 原数量 + 买入数量
   - `buy_price` = (原数量 × 原 buy_price + 买入数量 × 买入单价) ÷ 新 quantity

2. **更新 accounts：**
   - `balance` = balance - (买入数量 × 买入单价)

### 卖出

1. **判断是否清仓：**
   - 如果卖出数量 = 当前 quantity → 删除 stock_holdings / crypto_holdings 记录
   - 否则 → 更新 quantity = quantity - 卖出数量（buy_price 不变）

2. **更新 accounts：**
   - `balance` = balance + (卖出数量 × 卖出单价)

### 账户余额更新方式

直接通过 Supabase update 修改 accounts.balance，**不创建 transactions 记录**，因此不会触发现有的余额触发器 `trg_update_account_balance`。这是刻意的——股票买卖的资金流动不属于日常收支记录。

### 币种处理

**股票/基金：** 扣款/收款金额以持仓币种（CNY/USD/HKD）计算。UI 层面在账户下拉中将同币种的账户排在前面，不同币种的账户仍然可选但排在后面。

**加密货币：** 成本价始终以 USD 计价（现有设计）。扣款/收款金额以 USD 计算。账户下拉同样优先展示 USD 账户。

两者都暂不做跨币种汇率转换——用户需要自行选择合适的账户。

## UI 组件变更

### StockPortfolio.tsx（股票/基金）

**新增状态：**
- `expandedHoldingId: string | null` — 当前展开的持仓卡片 ID
- `buyDialogHolding: StockHolding | null` — 买入对话框关联的持仓
- `sellDialogHolding: StockHolding | null` — 卖出对话框关联的持仓

**卡片改造：**
- 现有持仓卡片 → 可点击展开/收起
- 展开区域包含操作按钮（买入、卖出、编辑、删除）
- 现有的编辑/删除按钮从卡片顶部移到展开区域内

**新增子组件（可以内联在 StockPortfolio 中，也可拆分）：**
- `BuyDialog` — 买入对话框
- `SellDialog` — 卖出对话框

### AssetOverview.tsx（加密货币）

**改造加密货币卡片：**
- 现有的加密货币持仓卡片（目前只有删除按钮）→ 改为和股票一样的展开/收起模式
- 展开区域包含操作按钮（买入、卖出、删除）
- 复用与 StockPortfolio 相同的 BuyDialog / SellDialog 逻辑

**新增状态：**
- `expandedCryptoId: string | null` — 当前展开的加密货币卡片 ID
- `cryptoBuyDialogHolding: CryptoHolding | null`
- `cryptoSellDialogHolding: CryptoHolding | null`

**Dialog 复用策略：** 买入/卖出 Dialog 的表单逻辑对股票和加密货币完全一致（数量、单价、关联账户、预览计算）。可以将 Dialog 抽取为共享组件，通过 props 传入持仓数据和对应的 Supabase 表名/mutate 函数。也可以在两个组件中各自内联实现——逻辑相同但代码独立，避免过度抽象。实现时根据代码量决定。

### 买入/卖出 Dialog 共同特征

- 使用 shadcn/ui Dialog 组件
- 表单字段使用 Input + Label
- 账户选择使用 Select 或自定义下拉
- 预览区域实时计算（使用 useMemo 或内联计算）
- 确认按钮提交后：
  1. 设置 loading 状态
  2. 执行 Supabase 更新
  3. 成功 → toast.success + 关闭 Dialog + 刷新持仓数据（mutate）+ 刷新账户数据（refreshAccounts）
  4. 失败 → toast.error + 保持 Dialog 打开
- 所有 async 操作遵循项目规范：try/catch/finally，finally 重置 loading

## 验证规则

| 场景 | 规则 |
|------|------|
| 买入数量 | > 0 |
| 买入单价 | > 0 |
| 卖出数量 | > 0 且 ≤ 当前持仓数量 |
| 卖出单价 | > 0 |
| 扣款/收款账户 | 必选 |

## 不做的事情

- **不写交易历史**：不向 stock_transactions 表插入记录
- **不做跨币种转换**：买卖操作不涉及汇率换算
- **不做手续费**：虽然 StockTransaction 接口有 fees 字段，本次不引入
