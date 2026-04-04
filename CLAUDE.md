@AGENTS.md

# MoneyTracker - 项目架构文档

## 概述
个人记账 PWA 应用，支持多账户、多币种、股票和加密货币追踪。无广告，通过 iOS 快捷指令可实现快捷记账。

## 技术栈
- **前端**: Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui (base-ui)
- **后端/数据库**: Supabase (PostgreSQL + Auth + RLS)
- **部署**: Vercel (自动部署，push 即生效)
- **API**: Yahoo Finance (股票)、CoinGecko (加密货币)、open.er-api.com (汇率)

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
    ├── stocks/route.ts     # Yahoo Finance 股票行情代理
    ├── crypto/route.ts     # CoinGecko 加密货币价格代理
    └── exchange/route.ts   # 汇率代理 (open.er-api.com)

components/
├── AppProvider.tsx         # 全局 Context (user, categories, accounts, mainCurrency)
├── AuthForm.tsx            # 登录/注册 (支持 Google OAuth + 邮箱密码)
├── BottomNav.tsx           # 底部导航栏 (概览/账单/记账+/资产/设置)
├── Dashboard.tsx           # 首页概览 (收支/账户/股票/汇率/支出排行/最近记录)
├── QuickEntry.tsx          # 快捷记账 (数字键盘/分类/账户选择/币种)
├── TransactionList.tsx     # 账单列表 (按月/按日分组/搜索/删除)
├── AssetOverview.tsx       # 资产总览 (净值/账户/信用卡/股票/加密货币/汇率)
├── StockPortfolio.tsx      # 股票持仓管理
├── AccountManager.tsx      # 添加/编辑账户对话框
├── AnnualReport.tsx        # 年度报告 (趋势图/分类构成/储蓄率)
├── SettingsPage.tsx        # 设置 (币种/导出/快捷指令说明)
└── ui/                     # shadcn/ui 组件 (card, input, dialog, badge, etc.)

lib/
├── supabase.ts             # Supabase 客户端 + 所有类型定义 + formatMoney
├── stocks.ts               # getStockQuotes() 封装
├── crypto.ts               # getCryptoPrices() + CRYPTO_SYMBOLS 配置
├── exchange.ts             # getExchangeRates() + convertCurrency()
└── utils.ts                # shadcn cn() 工具
```

## 数据库表 (Supabase)

| 表 | 用途 | RLS |
|---|---|---|
| `categories` | 记账分类 (餐饮/交通/购物等) | ✅ user_id |
| `transactions` | 收支记录 (关联 category_id + account_id) | ✅ user_id |
| `accounts` | 账户 (储蓄卡/信用卡/微信/支付宝等) | ✅ user_id |
| `stock_holdings` | 股票持仓 | ✅ user_id |
| `stock_transactions` | 股票交易记录 (表存在但UI未用) | ✅ user_id |
| `crypto_holdings` | 加密货币持仓 (BTC/ETH 等) | ✅ user_id |

### 关键数据库机制
- **余额触发器**: `trg_update_account_balance` — INSERT/UPDATE/DELETE 交易时自动更新 accounts.balance
- **新用户触发器**: `handle_new_user()` — 注册时自动创建默认分类(18个) + 默认账户(储蓄卡/信用卡/微信/支付宝)
- **所有表启用 RLS**: 策略为 `auth.uid() = user_id`

### 类型定义 (lib/supabase.ts)
- `Currency`: "CNY" | "USD" | "HKD"
- `TransactionType`: "expense" | "income"
- `AccountType`: "debit" | "credit" | "cash" | "investment" | "crypto"
- 主要接口: Transaction, Category, Account, StockHolding, CryptoHolding

## 全局状态 (AppProvider)
通过 React Context 提供:
- `user` — Supabase Auth 用户
- `categories` — 用户分类列表
- `accounts` — 用户账户列表 (过滤 is_archived)
- `mainCurrency` — 主币种 (默认 CNY)
- `signIn/signUp/signOut` — 认证方法
- `refreshCategories/refreshAccounts` — 刷新数据

## UI 风格
- shadcn/ui 圆角卡片风格 (Card, Badge, Separator, Dialog 等)
- 支出用红色 (text-red-600, bg-red-50)，收入用绿色 (text-emerald-600, bg-emerald-50)
- 底部导航用 Lucide 图标，中间"记账"按钮突出
- 移动端优先，max-w-lg 居中

## 认证
- Google OAuth (通过 Supabase Auth)
- 邮箱/密码注册登录
- Supabase redirect URL 配置在 Dashboard → Authentication → URL Configuration

## 环境变量
```
NEXT_PUBLIC_SUPABASE_URL=https://vwgwtknbyngalyexnaei.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key in .env.local>
```
Vercel 上已配置相同变量。

## 常用命令
```bash
npm run dev          # 本地开发
npm run build        # 构建检查
git push             # 推送后 Vercel 自动部署
vercel --prod        # 手动部署到生产
```

## 注意事项
- shadcn/ui v4 使用 base-ui，Dialog/Sheet 等没有 `asChild` prop
- `.env.local` 在 .gitignore 中，不会被提交
- supabase.ts 中 URL 有 placeholder 兜底，避免构建时静态生成报错
- 汇率 API 有 1 小时客户端缓存，股票/加密货币 5 分钟服务端缓存
