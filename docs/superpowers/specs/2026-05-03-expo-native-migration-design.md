# MoneyTracker Native App Migration Design

## Overview

Migrate the MoneyTracker PWA (Next.js 16 + Supabase) to a native iOS app using React Native (Expo), with the intent to fully replace the Web version. The app will share the same Supabase backend and add native-only features (Widget, Face ID, haptics, push notifications).

## Decision Context

- **Target**: iOS first, Android later
- **Framework**: React Native + Expo (chosen over SwiftUI for React/TS reuse and cross-platform potential)
- **Web version**: Will be decommissioned after native app is stable
- **Primary motivations**: Native features (Widget, biometrics), better quick-entry UX, improved performance/feel

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Expo SDK 53 (managed workflow) | Simplifies native config, build, signing |
| Navigation | Expo Router v4 | File-based routing, familiar from Next.js |
| UI Library | Tamagui | Universal design system, excellent performance (compiles to native), great TypeScript support, iOS-native feel |
| Data Fetching | TanStack Query v5 | SWR replacement, better RN support, offline persistence |
| Backend | Supabase (same project: `vwgwtknbyngalyexnaei`) | Reuse all tables, RLS, triggers |
| Charts | Victory Native | recharts replacement for RN |
| Local Storage | expo-secure-store (auth) + MMKV (cache) | Secure keychain + fast KV store |
| Animation | React Native Reanimated 3 | Native-thread animations |
| Widget | Expo Widget Extension + SwiftUI | iOS home screen widgets |
| Push | expo-notifications | Local daily reminders |
| Auth | expo-auth-session + Supabase Auth | Google OAuth + email/password |

## Project Structure

New standalone repository (not monorepo with existing Next.js project):

```
money-tracker-app/
├── app/                        # Expo Router file-based routes
│   ├── (tabs)/                 # Bottom tab navigator group
│   │   ├── index.tsx           # Dashboard (overview)
│   │   ├── transactions.tsx    # Transaction list
│   │   ├── assets.tsx          # Asset overview
│   │   └── settings.tsx        # Settings
│   ├── quick.tsx               # Quick entry (full-screen modal)
│   ├── stocks.tsx              # Stock portfolio detail
│   └── report.tsx              # Annual report
├── components/                 # Reusable UI components
│   ├── QuickEntry/             # Numeric keypad, category picker
│   ├── TransactionList/        # Grouped list with swipe actions
│   ├── Dashboard/              # Charts, budget progress
│   ├── Assets/                 # Account cards, crypto, stocks
│   └── ui/                     # Base components (Card, Badge, etc.)
├── lib/                        # Business logic (heavily reused from web)
│   ├── supabase.ts             # Client init + type definitions
│   ├── hooks/                  # TanStack Query hooks
│   │   ├── useTransactions.ts
│   │   ├── useAccounts.ts
│   │   ├── useStockHoldings.ts
│   │   └── useUserSettings.ts
│   ├── stocks.ts               # Stock quote fetching
│   ├── crypto.ts               # Crypto price fetching
│   ├── exchange.ts             # Exchange rate fetching
│   └── constants.ts            # Shared constants (BANK_PRESETS, CRYPTO_SYMBOLS)
├── widgets/                    # iOS Widget Extension (SwiftUI)
│   ├── TodayExpense/           # Today's spending widget
│   ├── BudgetProgress/         # Monthly budget ring widget
│   └── QuickAction/            # Quick-entry shortcut widget
├── modules/                    # Expo native modules (if needed)
├── assets/                     # Images, fonts
├── app.json                    # Expo config
├── eas.json                    # EAS Build config
└── tsconfig.json
```

## Feature Migration Map

### Core Features (Web → Native)

| Web Feature | Native Implementation | Migration Strategy |
|---|---|---|
| Dashboard (MoM comparison, budget progress, expense breakdown) | Same logic, Victory Native charts | Rewrite UI, reuse calculation logic |
| QuickEntry (full-screen numeric keypad) | Full-screen modal + custom keypad + haptics | Rewrite UI with native enhancements |
| TransactionList (monthly/daily grouping, search, delete) | FlashList + section headers + swipe-to-delete | Rewrite UI, reuse grouping logic |
| AssetOverview (net worth, cash, stocks, crypto) | Card-based layout, same data sources | Rewrite UI, reuse logic |
| StockPortfolio | Same functionality | Rewrite UI |
| AnnualReport (trend charts, category breakdown) | Victory Native charts | Rewrite UI |
| Settings (currency, budget, categories, export) | Native-style grouped list | Rewrite UI |
| Auth (Google OAuth + email/password) | expo-auth-session + Supabase Auth | Rewrite auth flow for native |

### Native Enhancements (New)

| Feature | Implementation | Priority |
|---|---|---|
| iOS Widget (today expense / budget progress / quick entry) | Expo Widget Extension + SwiftUI + App Group data sharing | P1 |
| Haptic Feedback (on keypress, successful entry) | expo-haptics | P1 |
| Biometric Lock (Face ID / Touch ID) | expo-local-authentication | P1 |
| Local Push Notifications (daily reminder) | expo-notifications | P2 |
| Quick Actions (3D Touch app icon menu) | expo-quick-actions | P2 |
| App Intent / Siri voice entry | Expo Module (Swift) | P3 |
| Offline Support (local queue + sync) | MMKV + sync queue on reconnect | P3 |

## Data Architecture

### Supabase Backend (No Changes)

The existing Supabase project is shared directly:
- All 7 tables remain unchanged (categories, transactions, accounts, user_settings, stock_holdings, stock_transactions, crypto_holdings)
- All RLS policies remain active
- All triggers remain active (balance, usage_count, new_user)
- Only addition: register app's deep link URL scheme in Supabase Auth redirect config

### Authentication Flow

```
App Launch
├── Check expo-secure-store for cached session
├── Valid session → Optional Face ID check → Main app
├── No/expired session → Login screen
│   ├── Google OAuth (expo-auth-session → Supabase)
│   │   └── Redirect: moneytracker://auth/callback
│   └── Email/password (supabase.auth.signInWithPassword)
└── On login success → Store session in secure-store
```

Key differences from web:
- Token stored in encrypted iOS Keychain (via expo-secure-store), not localStorage
- OAuth uses deep link redirect, not web callback URL
- Optional biometric gate on app open (session stays valid)

### Data Fetching (TanStack Query)

Replace SWR hooks with TanStack Query:

```typescript
// Example: Monthly transactions
function useMonthTransactions(year: number, month: number) {
  return useQuery({
    queryKey: ['transactions', year, month],
    queryFn: () => fetchMonthTransactions(year, month),
    staleTime: 5 * 60 * 1000,
  })
}
```

Benefits over SWR for native:
- Built-in offline persistence via `persistQueryClient` + MMKV
- Better mutation invalidation patterns
- Optimistic updates with rollback

### API Proxy Migration

Current: App → Next.js API Routes (stocks/crypto/exchange) → External APIs

New: App → Supabase Edge Functions → External APIs

Three Edge Functions to create:
1. `stocks` — Tencent Finance (US/HK stocks) + Tiantian Fund (China funds)
2. `crypto` — CoinGecko price API
3. `exchange` — open.er-api.com rates

Each preserves: input validation, 8s timeout, caching, 503 fallback with stale cache.

### Widget Data Sharing

```
Main App ──(writes)──→ App Group (UserDefaults)
                       - todayExpenseTotal: number
                       - monthBudgetUsed: number
                       - monthBudgetTotal: number
                       - recentTransactions: [{amount, category, time}]
                       - lastUpdated: timestamp

Widget ──(reads)──→ App Group (UserDefaults) → Renders UI
```

Widget does NOT call Supabase directly. Main app updates App Group data on every relevant state change.

## UI Design Direction

### Design Language

| Aspect | Direction |
|---|---|
| Overall Style | iOS Human Interface Guidelines, rounded cards + translucency |
| Colors | Semantic: red for expense (text-red-600 equivalent), green for income |
| Typography | SF Pro (system), monospace for numbers |
| Navigation | Bottom tab bar (5 tabs: Overview / Transactions / [+Entry] / Assets / Settings) |
| Entry Point | Center tab button (prominent), opens full-screen modal |
| Lists | Native SectionList + swipe actions (delete/edit) |
| Dark Mode | Follow system + manual toggle |
| Haptics | Light impact on keypress, success notification on entry saved |

### Quick Entry UX Improvements (vs Web)

- Haptic feedback on every keypress
- Swipe-down gesture to dismiss
- After saving: 3-second window to continue next entry (doesn't auto-dismiss)
- Widget shortcut: tap widget category → opens quick entry with category pre-filled
- Smooth spring animations for keyboard/category transitions

## Migration Phases

### Phase 1: Foundation (Week 1)
- Expo project init with Router
- Supabase client setup + auth flow
- Tab navigation shell
- Basic type definitions (reuse from web)

### Phase 2: Core Features (Week 2)
- Quick Entry (most important UX)
- Transaction List
- Dashboard
- Data hooks (TanStack Query)

### Phase 3: Asset Management (Week 3)
- Asset Overview
- Stock Portfolio
- Crypto Holdings
- Exchange rates

### Phase 4: Native Enhancements (Week 4)
- iOS Widget (today expense + budget progress)
- Face ID / biometric lock
- Haptic feedback throughout
- Push notification reminders
- Edge Functions for API proxy

### Phase 5: Polish & Ship (Week 5)
- Annual Report
- Settings page
- App Store preparation (screenshots, description)
- TestFlight beta
- Performance optimization

## Non-Goals (Explicitly Out of Scope)

- Android support (deferred to later)
- Complex offline sync with conflict resolution (P3, not in initial release)
- Siri App Intent voice entry (P3)
- Apple Watch companion
- iPad-specific layout
- In-app purchase / subscription

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Expo SDK limitation blocks a native feature | Use Expo Modules API to write custom Swift bridge |
| Victory Native chart performance with large datasets | Limit chart data points, lazy-load historical data |
| App Store rejection | Follow HIG strictly, ensure proper privacy descriptions |
| Widget data staleness | Update App Group on every transaction + background refresh |
| OAuth redirect complexity on iOS | Use expo-auth-session's proven flow, test on device early |
