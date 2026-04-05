@AGENTS.md

# MoneyTracker - 项目架构文档

## 概述
个人记账 PWA 应用，支持多账户、多币种、股票和加密货币追踪。无广告，通过 iOS 快捷指令可实现快捷记账。

## 技术栈
- **前端**: Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui (base-ui)
- **后端/数据库**: Supabase (PostgreSQL + Auth + RLS)
- **部署**: Vercel (自动部署，push 即生效)
- **API**: 腾讯财经 (美股/港股)、天天基金 (国内基金)、CoinGecko (加密货币)、open.er-api.com (汇率)

## 线上地址
- **App**: https://money-tracker-pied-one.vercel.app
- **GitHub**: https://github.com/Liqiuyue9597/money-tracker
- **Supabase 项目 ref**: vwgwtknbyngalyexnaei

## 项目结构

```
app/
├── layout.tsx              # 根布局 (Geist 字体, AppProvider, Toaster)
├── page.tsx                # 首页 → Dashboard
├── quick/page.tsx          # 快捷记账
├── transactions/page.tsx   # 账单列表
├── assets/page.tsx         # 资产总览
├── stocks/page.tsx         # 股票详情 (独立页，也整合在资产中)
├── report/page.tsx         # 年度报告
├── settings/page.tsx       # 设置
└── api/
    ├── stocks/route.ts     # 股票行情代理 (腾讯财经: 美股/港股, 天天基金: 国内基金)
    ├── crypto/route.ts     # CoinGecko 加密货币价格代理
    └── exchange/route.ts   # 汇率代理 (open.er-api.com)

components/
├── AppProvider.tsx         # 全局 Context (user, categories, accounts, mainCurrency)
├── AuthForm.tsx            # 登录/注册 (支持 Google OAuth + 邮箱密码)
├── BottomNav.tsx           # 底部导航栏 (概览/账单/记账+/资产/设置)
├── Dashboard.tsx           # 首页概览 (收支/账户/股票/汇率/支出排行/最近记录)
├── QuickEntry.tsx          # 快捷记账 (数字键盘/分类/账户选择/币种)
├── TransactionList.tsx     # 账单列表 (按月/按日分组/搜索/删除)
├── AssetOverview.tsx       # 资产总览 (净值/现金账户/股票/加密货币/汇率)
├── StockPortfolio.tsx      # 股票持仓管理
├── AccountManager.tsx      # 添加/编辑现金账户对话框 (银行预设+自定义)
├── CategoryManager.tsx     # 添加/编辑/删除分类对话框 (emoji图标选择)
├── AnnualReport.tsx        # 年度报告 (趋势图/分类构成/储蓄率)
├── SettingsPage.tsx        # 设置 (币种/分类管理/导出/快捷指令说明)
└── ui/                     # shadcn/ui 组件 (card, input, dialog, badge, etc.)

lib/
├── supabase.ts             # Supabase 客户端 + 类型定义 + BANK_PRESETS + formatMoney
├── stocks.ts               # getStockQuotes() 封装
├── crypto.ts               # getCryptoPrices() + CRYPTO_SYMBOLS 配置
├── exchange.ts             # getExchangeRates() + convertCurrency()
└── utils.ts                # shadcn cn() 工具
```

## 资产类型体系

按资产本质分为 3 类（而非按金融机构分类）：

| AccountType | 说明 | 管理入口 |
|---|---|---|
| `cash` | 所有"钱"类资产：银行卡、信用卡、现金、支付宝、微信、公积金等 | AccountManager 对话框 |
| `stock` | 股票持仓（通过 stock_holdings 表管理） | StockPortfolio / stocks 页面 |
| `crypto` | 加密货币持仓（通过 crypto_holdings 表管理） | AssetOverview 内置对话框 |

### 现金账户（cash）
- 用户自由命名，不限制子类型
- 通过 `BANK_PRESETS` 提供快捷选择（微信支付、支付宝、招商银行、中国银行）+ 自定义输入
- 按余额正负自动分组显示：正余额 → "储蓄与支付"，负余额 → "待还"
- 支持 `exclude_from_total` 字段（如公积金：显示在概览但不计入净值）

### 股票 & 加密货币
- 不通过 AccountManager 创建，各有独立管理入口
- 股票：实时行情来自 Yahoo Finance，显示盈亏百分比
- 加密货币：实时价格来自 CoinGecko，显示盈亏

## 数据库表 (Supabase)

| 表 | 用途 | RLS |
|---|---|---|
| `categories` | 记账分类 (餐饮/交通/购物等，18个默认，支持自定义增删改) | ✅ user_id |
| `transactions` | 收支记录 (关联 category_id + account_id) | ✅ user_id |
| `accounts` | 现金账户 (type=cash) | ✅ user_id |
| `stock_holdings` | 股票持仓 (symbol, quantity, buy_price, currency) | ✅ user_id |
| `stock_transactions` | 股票交易记录 (表存在但UI未用) | ✅ user_id |
| `crypto_holdings` | 加密货币持仓 (BTC/ETH 等) | ✅ user_id |

### accounts 表关键字段
```sql
id, user_id, name, type, currency, icon, balance, sort_order, is_archived, exclude_from_total, created_at
-- type CHECK: 'cash', 'stock', 'crypto'
-- balance: 由触发器自动维护，不可手动修改
-- exclude_from_total: 不计入总资产净值（如公积金）
```

### 关键数据库机制
- **余额触发器**: `trg_update_account_balance` — INSERT/UPDATE/DELETE 交易时自动更新 accounts.balance
  - expense → balance -= amount
  - income → balance += amount
  - 仅在 account_id IS NOT NULL 时触发
- **分类使用次数触发器**: `trg_update_category_usage_count` — INSERT/UPDATE/DELETE 交易时自动更新 categories.usage_count
  - INSERT → usage_count +1
  - DELETE → usage_count -1
  - UPDATE (category_id 变更) → 旧分类 -1，新分类 +1
- **新用户触发器**: `handle_new_user()` — 注册时自动创建：
  - 18 个默认分类（12 支出 + 6 收入）
  - 4 个默认账户：中国银行储蓄卡、中国银行信用卡、微信支付、支付宝（全部 type=cash）
- **所有表启用 RLS**: 策略为 `auth.uid() = user_id`

### 类型定义 (lib/supabase.ts)
- `Currency`: "CNY" | "USD" | "HKD"
- `TransactionType`: "expense" | "income"
- `AccountType`: "cash" | "stock" | "crypto"
- `BankPreset`: { name, icon, types } — 银行/机构预设列表
- 主要接口: Transaction, Category, Account, StockHolding, CryptoHolding

## 分类管理
- **自定义分类**: 用户可在设置页面添加/编辑/删除分类（支出和收入分开管理）
- **使用频率排序**: 分类按 `usage_count DESC, sort_order ASC` 排序，最常用的自动排在最前面
- **usage_count 字段**: 由数据库触发器自动维护，记录每个分类被使用的交易次数
- **删除保护**: 已有交易记录的分类（usage_count > 0）不允许删除
- **管理入口**: SettingsPage → 分类管理 section → CategoryManager Dialog

## 全局状态 (AppProvider)
通过 React Context 提供（value 已用 useMemo 优化，函数用 useCallback 包裹）:
- `user` — Supabase Auth 用户
- `categories` — 用户分类列表（按使用频率降序排列）
- `accounts` — 用户账户列表 (过滤 is_archived)
- `mainCurrency` — 主币种 (默认 CNY)
- `signIn/signUp/signOut` — 认证方法
- `refreshCategories/refreshAccounts` — 刷新数据（含 try/catch 错误处理）

## 汇率显示
- 所有页面（Dashboard + AssetOverview）统一以 **1 USD 为基准**显示汇率
- 内部货币换算仍使用 mainCurrency 为基准的汇率（rates state）
- 显示用的 USD 汇率单独请求（usdRates state）
- 汇率 API: open.er-api.com，1 小时客户端缓存（按币种独立 Map 缓存）+ 1 小时服务端缓存

## UI 风格
- shadcn/ui 圆角卡片风格 (Card, Badge, Separator, Dialog 等)
- 支出用红色 (text-red-600)，收入用绿色 (text-emerald-600)
- 底部导航用 Lucide 图标，中间"记账"按钮突出
- 移动端优先，max-w-lg 居中
- AccountManager: 黑白极简风格 (bg-[#0A0A0A] 按钮, border-hairline 边框)
- CategoryManager: 同 AccountManager 风格，emoji 图标 grid 选择

## 认证
- Google OAuth (通过 Supabase Auth)
- 邮箱/密码注册登录
- Supabase redirect URL 配置在 Dashboard → Authentication → URL Configuration

## 环境变量
```
NEXT_PUBLIC_SUPABASE_URL=https://vwgwtknbyngalyexnaei.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key in .env.local>
```

## 常用命令
```bash
npm run dev          # 本地开发
npm run build        # 构建检查
git push             # 推送后 Vercel 自动部署
vercel --prod        # 手动部署到生产
```

## 注意事项
- shadcn/ui v4 使用 base-ui，Dialog/Sheet 等**没有 `asChild` prop**
  - DialogTrigger 自身渲染 `<button>`，不要在里面再包 `<Button>`，否则嵌套 button 报错
  - 替代方案：用 `onClick` 手动控制 dialog 的 open 状态
- `.env.local` 在 .gitignore 中，不会被提交
- supabase.ts 中 URL 有 placeholder 兜底，避免构建时静态生成报错
- 汇率 API 有 1 小时客户端缓存，股票/加密货币 5 分钟服务端缓存
- 股票行情数据源：腾讯财经（美股前缀 `us`、港股前缀 `r_hk`）+ 天天基金（国内基金6位代码）
- 股票和基金混合管理，通过 symbol 格式自动路由：`.HK` → 港股，6位数字 → 国内基金，其他 → 美股
- accounts.balance **只能通过交易触发器修改**，创建时可设初始余额，之后不可手动改

## API 路由安全规范
所有 API 路由（stocks / crypto / exchange）均遵循以下规范：
- **输入验证**: 参数长度限制（max 200 chars）+ 正则白名单校验，非法输入返回 400
- **请求超时**: 8 秒 `AbortSignal.timeout()`，超时返回 504
- **错误响应**: 外部 API 不可用时返回 503（不返回虚假硬编码数据），优先使用过期缓存（stale cache）兜底
- **缓存策略**: exchange 使用 `Map<base, cache>` 按币种独立缓存，crypto 使用 `VALID_IDS` 白名单过滤
- **`??` 替代 `||`**: 数值字段用 `??` 避免 0 被当作 falsy

## 前端性能规范
- **AppProvider**: context value 用 `useMemo` 包裹，所有函数用 `useCallback`，避免全局重渲染
- **计算密集型派生数据**: 必须用 `useMemo`（如 TransactionList 的过滤/分组/合计，AssetOverview 的净值/加密货币总值计算）
- **异步操作**: 所有 async 函数必须 `try/catch/finally`，finally 中重置 loading 状态，catch 中用 `toast.error()` 提示 + `console.error()` 记录
- **数据库操作**: 检查 `{ error }` 返回值，成功后用 `toast.success()` 确认，失败时不做乐观更新
