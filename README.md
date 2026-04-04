# MoneyTracker

个人记账 PWA 应用，支持多账户、多币种、股票和加密货币追踪。无广告，通过 iOS 快捷指令可实现快捷记账。

- **线上地址**: https://money-tracker-pied-one.vercel.app
- **技术栈**: Next.js 16 + TypeScript + Tailwind CSS v4 + shadcn/ui + Supabase

## 功能

- 多账户管理（银行卡、信用卡、微信、支付宝等）
- 多币种支持（CNY / USD / HKD）+ 实时汇率
- 股票持仓追踪（Yahoo Finance 实时行情）
- 加密货币持仓追踪（CoinGecko 实时价格）
- 按月/按日分组的账单列表，支持搜索
- 年度报告（趋势图、分类构成、储蓄率）
- iOS 快捷指令快捷记账
- Google OAuth + 邮箱密码登录

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.local.example .env.local
# 填入 Supabase URL 和 Anon Key

# 本地开发
npm run dev

# 构建检查
npm run build

# 部署（push 即自动部署到 Vercel）
git push
```

## 环境变量

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 项目结构

```
app/
├── layout.tsx              # 根布局
├── page.tsx                # 首页 Dashboard
├── quick/page.tsx          # 快捷记账
├── transactions/page.tsx   # 账单列表
├── assets/page.tsx         # 资产总览
├── stocks/page.tsx         # 股票详情
├── report/page.tsx         # 年度报告
├── settings/page.tsx       # 设置
└── api/
    ├── stocks/route.ts     # 股票行情代理（输入验证 + 8s 超时）
    ├── crypto/route.ts     # 加密货币价格代理（输入验证 + 白名单 + 8s 超时）
    └── exchange/route.ts   # 汇率代理（输入验证 + 按币种独立缓存）

components/
├── AppProvider.tsx         # 全局 Context（useMemo 优化）
├── Dashboard.tsx           # 首页概览
├── QuickEntry.tsx          # 快捷记账
├── TransactionList.tsx     # 账单列表（useMemo 优化过滤/分组/合计）
├── AssetOverview.tsx       # 资产总览（useMemo 优化净值计算）
├── StockPortfolio.tsx      # 股票持仓管理
├── AccountManager.tsx      # 账户管理对话框
├── AnnualReport.tsx        # 年度报告
├── AuthForm.tsx            # 登录注册
├── BottomNav.tsx           # 底部导航
├── SettingsPage.tsx        # 设置页
└── ui/                     # shadcn/ui 组件

lib/
├── supabase.ts             # Supabase 客户端 + 类型定义
├── stocks.ts               # 股票行情封装
├── crypto.ts               # 加密货币价格封装
├── exchange.ts             # 汇率获取 + 货币转换（Map 缓存）
└── utils.ts                # cn() 工具
```

## API 安全

所有 API 路由均实现：
- **输入验证** — 长度限制 + 正则校验，拒绝非法字符
- **请求超时** — 8 秒 AbortSignal，超时返回 504
- **优雅降级** — 外部 API 不可用时返回 503（而非虚假数据），优先使用过期缓存兜底
- **缓存策略** — 汇率 1 小时（按币种独立 Map 缓存），股票/加密货币 5 分钟

## 部署

项目通过 Vercel 自动部署，`git push` 即生效。也可手动部署：

```bash
vercel --prod
```
