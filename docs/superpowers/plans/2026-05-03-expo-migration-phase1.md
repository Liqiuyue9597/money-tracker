# MoneyTracker Native App - Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a working Expo app shell with authentication, tab navigation, global state, and Supabase connectivity — the skeleton upon which all features will be built.

**Architecture:** Expo Router v4 file-based routing with a bottom tab navigator. TanStack Query for server state, React Context for auth/global state. Supabase JS SDK for backend with expo-secure-store for token persistence.

**Tech Stack:** Expo SDK 53, Expo Router v4, TypeScript, TanStack Query v5, Supabase JS v2, expo-secure-store, React Native Reanimated 3, Tamagui (UI library)

---

## File Structure (Phase 1)

```
money-tracker-app/
├── app/
│   ├── _layout.tsx                 # Root layout: providers, fonts
│   ├── (auth)/
│   │   ├── _layout.tsx             # Auth layout (no tabs)
│   │   └── login.tsx               # Login/signup screen
│   ├── (tabs)/
│   │   ├── _layout.tsx             # Tab navigator layout
│   │   ├── index.tsx               # Dashboard placeholder
│   │   ├── transactions.tsx        # Transactions placeholder
│   │   ├── assets.tsx              # Assets placeholder
│   │   └── settings.tsx            # Settings placeholder
│   └── quick.tsx                   # Quick entry placeholder (modal)
├── lib/
│   ├── supabase.ts                 # Supabase client + auth helpers
│   ├── types.ts                    # All TypeScript interfaces (from web)
│   ├── constants.ts                # BANK_PRESETS, CURRENCIES, etc.
│   ├── query-client.ts             # TanStack Query client config
│   └── hooks/
│       ├── useAuth.ts              # Auth state hook
│       └── useUserSettings.ts      # User settings hook (TanStack Query)
├── components/
│   └── providers/
│       └── AppProvider.tsx          # Combined providers wrapper
├── app.json                        # Expo config
├── eas.json                        # EAS Build config
├── package.json
├── tsconfig.json
└── babel.config.js
```

---

### Task 1: Initialize Expo Project

**Files:**
- Create: `money-tracker-app/package.json`
- Create: `money-tracker-app/app.json`
- Create: `money-tracker-app/tsconfig.json`
- Create: `money-tracker-app/babel.config.js`
- Create: `money-tracker-app/.gitignore`
- Create: `money-tracker-app/eas.json`

- [ ] **Step 1: Create new directory and initialize Expo project**

Run from parent directory (e.g., `~/github/`):

```bash
npx create-expo-app@latest money-tracker-app --template tabs
cd money-tracker-app
```

- [ ] **Step 2: Install core dependencies**

```bash
npx expo install expo-secure-store expo-router expo-font expo-splash-screen expo-status-bar expo-haptics react-native-reanimated react-native-gesture-handler react-native-safe-area-context react-native-screens
npm install @supabase/supabase-js @tanstack/react-query @react-native-async-storage/async-storage
npm install lucide-react-native react-native-svg
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D @types/react typescript
```

- [ ] **Step 4: Update `app.json` with project config**

Replace the generated `app.json`:

```json
{
  "expo": {
    "name": "MoneyTracker",
    "slug": "money-tracker",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "moneytracker",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.moneytracker.app",
      "infoPlist": {
        "NSFaceIDUsageDescription": "Use Face ID to unlock the app"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.moneytracker.app"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#ffffff",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

- [ ] **Step 5: Create `eas.json`**

```json
{
  "cli": {
    "version": ">= 13.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 6: Update `tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 7: Verify project runs**

```bash
npx expo start
```

Expected: Expo dev server starts, displays QR code. Metro bundler output shows no errors.

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: initialize Expo project with core dependencies"
```

---

### Task 2: Type Definitions & Constants

**Files:**
- Create: `money-tracker-app/lib/types.ts`
- Create: `money-tracker-app/lib/constants.ts`

- [ ] **Step 1: Create `lib/types.ts`**

Port all type definitions from the web project's `lib/supabase.ts`:

```typescript
// lib/types.ts — All shared TypeScript types

export type Currency = "CNY" | "USD" | "HKD";
export type TransactionType = "expense" | "income" | "transfer";
export type StockTransactionType = "buy" | "sell";
export type AccountType = "cash" | "stock" | "crypto";
export type StockAssetType = "fund" | "hk" | "us";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  icon: string;
  balance: number;
  sort_order: number;
  is_archived: boolean;
  exclude_from_total: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  type: TransactionType;
  sort_order: number;
  usage_count: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  category_id: string;
  category_name?: string;
  category_icon?: string;
  account_id: string | null;
  to_account_id: string | null;
  note: string;
  date: string;
  created_at: string;
}

export interface TransactionWithJoins extends Transaction {
  categories?: { name: string; icon: string } | null;
  accounts?: { name: string; icon: string } | null;
  to_accounts?: { name: string; icon: string } | null;
}

export interface StockHolding {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  buy_price: number;
  quantity: number;
  buy_date: string;
  currency: Currency;
  notes: string;
  asset_type: StockAssetType;
  manual_price: number | null;
  manual_price_updated_at: string | null;
  created_at: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  isFund?: boolean;
  nav?: number;
  estimate?: number;
  navDate?: string;
}

export interface StockTransaction {
  id: string;
  user_id: string;
  symbol: string;
  type: StockTransactionType;
  price: number;
  quantity: number;
  currency: Currency;
  date: string;
  fees: number;
  created_at: string;
}

export interface CryptoHolding {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  notes: string;
  manual_price: number | null;
  manual_price_updated_at: string | null;
  created_at: string;
}

export interface CryptoPrice {
  usd: number;
  usd_24h_change: number;
}

export interface UserSetting {
  user_id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  updated: string;
}

export interface BankPreset {
  name: string;
  icon: string;
  types: AccountType[];
}
```

- [ ] **Step 2: Create `lib/constants.ts`**

```typescript
// lib/constants.ts — App constants and presets

import type { BankPreset, Currency } from "./types";

export const BANK_PRESETS: BankPreset[] = [
  { name: "微信支付", icon: "💬", types: ["cash"] },
  { name: "支付宝", icon: "🔵", types: ["cash"] },
  { name: "招商银行", icon: "🏦", types: ["cash"] },
  { name: "中国银行", icon: "🏦", types: ["cash"] },
];

export const CURRENCIES: Record<Currency, { symbol: string; name: string; locale: string }> = {
  CNY: { symbol: "¥", name: "人民币", locale: "zh-CN" },
  USD: { symbol: "$", name: "美元", locale: "en-US" },
  HKD: { symbol: "HK$", name: "港币", locale: "zh-HK" },
};

export const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; defaultIcon: string }> = {
  cash: { label: "现金账户", defaultIcon: "💰" },
  stock: { label: "股票", defaultIcon: "📈" },
  crypto: { label: "加密货币", defaultIcon: "₿" },
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "餐饮", icon: "🍜" },
  { name: "交通", icon: "🚗" },
  { name: "购物", icon: "🛍️" },
  { name: "日用", icon: "🏠" },
  { name: "娱乐", icon: "🎮" },
  { name: "医疗", icon: "💊" },
  { name: "教育", icon: "📚" },
  { name: "通讯", icon: "📱" },
  { name: "服饰", icon: "👔" },
  { name: "旅行", icon: "✈️" },
  { name: "社交", icon: "🎉" },
  { name: "其他", icon: "📌" },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: "工资", icon: "💰" },
  { name: "奖金", icon: "🎁" },
  { name: "投资", icon: "📈" },
  { name: "兼职", icon: "💼" },
  { name: "红包", icon: "🧧" },
  { name: "其他", icon: "📌" },
];

export const CRYPTO_SYMBOLS: Record<string, { name: string; icon: string }> = {
  BTC: { name: "Bitcoin", icon: "₿" },
  ETH: { name: "Ethereum", icon: "Ξ" },
  SOL: { name: "Solana", icon: "◎" },
  DOGE: { name: "Dogecoin", icon: "Ð" },
};

export function formatMoney(amount: number, currency: Currency): string {
  const c = CURRENCIES[currency];
  return `${c.symbol}${Math.abs(amount).toLocaleString(c.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/constants.ts
git commit -m "feat: add type definitions and constants from web project"
```

---

### Task 3: Supabase Client with Secure Token Storage

**Files:**
- Create: `money-tracker-app/lib/supabase.ts`

- [ ] **Step 1: Create `lib/supabase.ts`**

This is the core Supabase client configured for React Native with expo-secure-store for token persistence:

```typescript
// lib/supabase.ts — Supabase client for React Native

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SUPABASE_URL = "https://vwgwtknbyngalyexnaei.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Custom storage adapter using expo-secure-store for iOS/Android
// Falls back to no persistence if SecureStore is unavailable (e.g., web)
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") return;
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore can fail if value > 2048 bytes on some devices
      // Silently fail — user will need to re-login
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") return;
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore removal errors
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important for RN — no URL-based auth detection
  },
});
```

- [ ] **Step 2: Create `.env` file (not committed)**

```bash
echo 'EXPO_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key_here' > .env
echo '.env' >> .gitignore
```

- [ ] **Step 3: Verify Supabase client imports without error**

Create a quick smoke test — add to an existing test or create temporary file:

```bash
npx tsc --noEmit
```

Expected: No type errors related to supabase.ts.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase.ts .gitignore
git commit -m "feat: add Supabase client with secure token storage"
```

---

### Task 4: TanStack Query Client Setup

**Files:**
- Create: `money-tracker-app/lib/query-client.ts`

- [ ] **Step 1: Create `lib/query-client.ts`**

```typescript
// lib/query-client.ts — TanStack Query client configuration

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus (mobile: frequent background/foreground)
      refetchOnWindowFocus: false,
      // Retry once on failure
      retry: 1,
      // Don't retry on 4xx errors
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/query-client.ts
git commit -m "feat: add TanStack Query client configuration"
```

---

### Task 5: Auth Hook

**Files:**
- Create: `money-tracker-app/lib/hooks/useAuth.ts`

- [ ] **Step 1: Create `lib/hooks/useAuth.ts`**

This hook manages auth state, listens to Supabase auth changes, and provides sign-in/sign-up/sign-out methods:

```typescript
// lib/hooks/useAuth.ts — Authentication state management

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

interface AuthActions {
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    user,
    session,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hooks/useAuth.ts
git commit -m "feat: add auth hook with Supabase session management"
```

---

### Task 6: User Settings Hook (TanStack Query)

**Files:**
- Create: `money-tracker-app/lib/hooks/useUserSettings.ts`

- [ ] **Step 1: Create `lib/hooks/useUserSettings.ts`**

```typescript
// lib/hooks/useUserSettings.ts — User settings via TanStack Query

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Currency } from "@/lib/types";

interface UserSettings {
  main_currency: Currency;
  monthly_budget: number | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  main_currency: "CNY",
  monthly_budget: null,
};

export function useUserSettings(userId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: settings = DEFAULT_SETTINGS, isLoading } = useQuery({
    queryKey: ["user_settings", userId],
    queryFn: async (): Promise<UserSettings> => {
      if (!userId) return DEFAULT_SETTINGS;

      const { data, error } = await supabase
        .from("user_settings")
        .select("key, value")
        .eq("user_id", userId);

      if (error) throw error;

      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[row.key] = row.value;
      }

      const mainCurrency = map.main_currency as Currency;
      const budgetRaw = map.monthly_budget;
      const budget = budgetRaw != null ? Number(budgetRaw) : null;

      return {
        main_currency: ["CNY", "USD", "HKD"].includes(mainCurrency) ? mainCurrency : "CNY",
        monthly_budget: budget != null && Number.isFinite(budget) && budget > 0 ? budget : null,
      };
    },
    enabled: !!userId,
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      if (!userId) throw new Error("Not authenticated");

      const { error } = await supabase.from("user_settings").upsert({
        user_id: userId,
        key,
        value,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_settings", userId] });
    },
  });

  const setMainCurrency = async (currency: Currency) => {
    await updateSettingMutation.mutateAsync({ key: "main_currency", value: currency });
  };

  const setMonthlyBudget = async (budget: number) => {
    await updateSettingMutation.mutateAsync({ key: "monthly_budget", value: String(budget) });
  };

  return {
    settings,
    isLoading,
    setMainCurrency,
    setMonthlyBudget,
    isUpdating: updateSettingMutation.isPending,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hooks/useUserSettings.ts
git commit -m "feat: add user settings hook with TanStack Query"
```

---

### Task 7: App Provider (Combined Providers)

**Files:**
- Create: `money-tracker-app/components/providers/AppProvider.tsx`

- [ ] **Step 1: Create `components/providers/AppProvider.tsx`**

This wraps the app with all required providers (QueryClient, Auth context):

```typescript
// components/providers/AppProvider.tsx — Root provider wrapper

import React, { createContext, useContext, useMemo } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUserSettings } from "@/lib/hooks/useUserSettings";
import type { User } from "@supabase/supabase-js";
import type { Currency } from "@/lib/types";

interface AppContextType {
  user: User | null;
  loading: boolean;
  mainCurrency: Currency;
  monthlyBudget: number | null;
  setMainCurrency: (c: Currency) => Promise<void>;
  setMonthlyBudget: (v: number) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function AppProviderInner({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const { settings, setMainCurrency, setMonthlyBudget } = useUserSettings(user?.id);

  const value = useMemo<AppContextType>(
    () => ({
      user,
      loading,
      mainCurrency: settings.main_currency,
      monthlyBudget: settings.monthly_budget,
      setMainCurrency,
      setMonthlyBudget,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [user, loading, settings, setMainCurrency, setMonthlyBudget, signInWithEmail, signUpWithEmail, signOut]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProviderInner>{children}</AppProviderInner>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/providers/AppProvider.tsx
git commit -m "feat: add combined AppProvider with auth + query + settings"
```

---

### Task 8: Root Layout with Providers

**Files:**
- Create: `money-tracker-app/app/_layout.tsx`

- [ ] **Step 1: Create `app/_layout.tsx`**

The root layout provides the AppProvider and handles auth-based navigation (redirect unauthenticated users to login):

```typescript
// app/_layout.tsx — Root layout with auth gating

import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { AppProvider, useApp } from "@/components/providers/AppProvider";

// Keep splash screen visible while we load auth state
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useApp();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      // Not signed in and not on auth screen → redirect to login
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      // Signed in and on auth screen → redirect to home
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="quick"
          options={{
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <RootLayoutNav />
    </AppProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: add root layout with auth gating and splash screen"
```

---

### Task 9: Auth Screen (Login/Signup)

**Files:**
- Create: `money-tracker-app/app/(auth)/_layout.tsx`
- Create: `money-tracker-app/app/(auth)/login.tsx`

- [ ] **Step 1: Create `app/(auth)/_layout.tsx`**

```typescript
// app/(auth)/_layout.tsx — Auth group layout (no tabs)

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
```

- [ ] **Step 2: Create `app/(auth)/login.tsx`**

```typescript
// app/(auth)/login.tsx — Login/signup screen

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/components/providers/AppProvider";
import { supabase } from "@/lib/supabase";
import * as WebBrowser from "expo-web-browser";

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert("提示", "请输入邮箱和密码");
      return;
    }
    if (password.length < 6) {
      Alert.alert("提示", "密码至少6位");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
        Alert.alert("注册成功", "请检查邮箱确认链接");
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "操作失败";
      Alert.alert("错误", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "moneytracker://auth/callback",
        },
      });

      if (error) {
        Alert.alert("错误", error.message);
        return;
      }

      if (data?.url) {
        await WebBrowser.openAuthSessionAsync(data.url, "moneytracker://auth/callback");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google 登录失败";
      Alert.alert("错误", message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Text style={styles.icon}>💰</Text>
          <Text style={styles.title}>MoneyTracker</Text>
          <Text style={styles.subtitle}>个人记账工具</Text>
        </View>

        <View style={styles.form}>
          {/* Google Login */}
          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin}>
            <Text style={styles.googleButtonText}>使用 Google 账号登录</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email/Password */}
          <TextInput
            style={styles.input}
            placeholder="邮箱地址"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="密码（至少6位）"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isSignUp ? "注册" : "登录"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            style={styles.toggleButton}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? "已有账户？" : "没有账户？"}
              <Text style={styles.toggleHighlight}>
                {isSignUp ? " 登录" : " 注册"}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  googleButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#eee",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: "#999",
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
  },
  submitButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  toggleButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 14,
    color: "#888",
  },
  toggleHighlight: {
    color: "#111",
    fontWeight: "500",
  },
});
```

- [ ] **Step 3: Install expo-web-browser for OAuth**

```bash
npx expo install expo-web-browser
```

- [ ] **Step 4: Verify the auth screen renders**

```bash
npx expo start
```

Expected: App launches, shows login screen with Google button and email/password form.

- [ ] **Step 5: Commit**

```bash
git add app/(auth)/_layout.tsx app/(auth)/login.tsx
git commit -m "feat: add auth screens with email login and Google OAuth"
```

---

### Task 10: Tab Navigator Layout

**Files:**
- Create: `money-tracker-app/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create `app/(tabs)/_layout.tsx`**

```typescript
// app/(tabs)/_layout.tsx — Bottom tab navigator

import { Tabs } from "expo-router";
import { Home, Receipt, PlusCircle, Wallet, Settings } from "lucide-react-native";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

function QuickEntryButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.quickButton}
      onPress={() => router.push("/quick")}
      activeOpacity={0.8}
    >
      <PlusCircle size={28} color="#fff" />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: "#111",
        tabBarInactiveTintColor: "#999",
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "概览",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: "账单",
          tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quick-placeholder"
        options={{
          title: "记账",
          tabBarButton: () => <QuickEntryButton />,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: "资产",
          tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "设置",
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 84,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  quickButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/(tabs)/_layout.tsx
git commit -m "feat: add bottom tab navigator with quick entry button"
```

---

### Task 11: Placeholder Screens (Tabs + Quick Entry)

**Files:**
- Create: `money-tracker-app/app/(tabs)/index.tsx`
- Create: `money-tracker-app/app/(tabs)/transactions.tsx`
- Create: `money-tracker-app/app/(tabs)/assets.tsx`
- Create: `money-tracker-app/app/(tabs)/settings.tsx`
- Create: `money-tracker-app/app/(tabs)/quick-placeholder.tsx`
- Create: `money-tracker-app/app/quick.tsx`

- [ ] **Step 1: Create `app/(tabs)/index.tsx` (Dashboard placeholder)**

```typescript
// app/(tabs)/index.tsx — Dashboard placeholder

import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/components/providers/AppProvider";

export default function DashboardScreen() {
  const { user, mainCurrency } = useApp();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.greeting}>概览</Text>
        <Text style={styles.subtitle}>
          {user?.email ?? "未登录"} | {mainCurrency}
        </Text>
        <Text style={styles.placeholder}>Dashboard 功能将在 Phase 2 实现</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20, justifyContent: "center", alignItems: "center" },
  greeting: { fontSize: 24, fontWeight: "700", color: "#111" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 8 },
  placeholder: { fontSize: 14, color: "#999", marginTop: 20 },
});
```

- [ ] **Step 2: Create `app/(tabs)/transactions.tsx`**

```typescript
// app/(tabs)/transactions.tsx — Transactions placeholder

import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TransactionsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>账单</Text>
        <Text style={styles.placeholder}>交易列表将在 Phase 2 实现</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
  placeholder: { fontSize: 14, color: "#999", marginTop: 12 },
});
```

- [ ] **Step 3: Create `app/(tabs)/assets.tsx`**

```typescript
// app/(tabs)/assets.tsx — Assets placeholder

import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AssetsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>资产</Text>
        <Text style={styles.placeholder}>资产管理将在 Phase 3 实现</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
  placeholder: { fontSize: 14, color: "#999", marginTop: 12 },
});
```

- [ ] **Step 4: Create `app/(tabs)/settings.tsx`**

```typescript
// app/(tabs)/settings.tsx — Settings placeholder with logout

import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/components/providers/AppProvider";

export default function SettingsScreen() {
  const { user, signOut } = useApp();

  async function handleSignOut() {
    Alert.alert("确认退出", "确定要退出登录吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "退出失败";
            Alert.alert("错误", message);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>设置</Text>
        <Text style={styles.email}>{user?.email}</Text>

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
  email: { fontSize: 14, color: "#666", marginTop: 8 },
  logoutButton: {
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#fee",
  },
  logoutText: { fontSize: 16, color: "#c00", fontWeight: "500" },
});
```

- [ ] **Step 5: Create `app/(tabs)/quick-placeholder.tsx`**

This is a dummy file needed for the tab route to exist (actual quick entry is a modal):

```typescript
// app/(tabs)/quick-placeholder.tsx — Dummy screen (never displayed)

import { View } from "react-native";

export default function QuickPlaceholder() {
  return <View />;
}
```

- [ ] **Step 6: Create `app/quick.tsx` (full-screen modal)**

```typescript
// app/quick.tsx — Quick entry modal placeholder

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";

export default function QuickEntryScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <X size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>快捷记账</Text>
        <Text style={styles.placeholder}>完整记账功能将在 Phase 2 实现</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "flex-start", padding: 16 },
  closeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111" },
  placeholder: { fontSize: 14, color: "#999", marginTop: 12 },
});
```

- [ ] **Step 7: Verify app runs with full navigation**

```bash
npx expo start
```

Expected: App launches → login screen → after login → tabs visible (概览/账单/记账/资产/设置) → center button opens modal → X closes it.

- [ ] **Step 8: Commit**

```bash
git add app/(tabs)/index.tsx app/(tabs)/transactions.tsx app/(tabs)/assets.tsx app/(tabs)/settings.tsx app/(tabs)/quick-placeholder.tsx app/quick.tsx
git commit -m "feat: add placeholder screens for all tabs and quick entry modal"
```

---

### Task 12: End-to-End Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Start the app on iOS simulator**

```bash
npx expo start --ios
```

- [ ] **Step 2: Verify auth flow**

1. App should show login screen on first launch
2. Enter valid email/password → navigates to tabs
3. Go to Settings → tap "退出登录" → returns to login
4. Kill and reopen app → should auto-login (session persisted in secure-store)

- [ ] **Step 3: Verify navigation**

1. Tabs switch correctly between 概览/账单/资产/设置
2. Center "记账" button opens full-screen modal from bottom
3. X button in modal closes it
4. Tab bar shows active/inactive states correctly

- [ ] **Step 4: Verify data connectivity**

1. After login, Dashboard screen shows email and currency (CNY)
2. No console errors related to Supabase connectivity

- [ ] **Step 5: Document any issues found**

Create `KNOWN_ISSUES.md` if anything needs fixing in Phase 2.

- [ ] **Step 6: Final commit with any fixes**

```bash
git add -A
git commit -m "chore: phase 1 complete — foundation app shell with auth and navigation"
```

---

## Phase 1 Success Criteria

After completing all tasks, the app should:

1. **Boot cleanly** on iOS simulator
2. **Auth works** — login/logout with email/password, session persists across app restarts
3. **Navigation works** — 5-tab bottom nav, center button opens modal
4. **Data flows** — Supabase client connects, user settings load
5. **TypeScript compiles** — `npx tsc --noEmit` passes with no errors
6. **Types are complete** — All interfaces from web project are ported

## Next Phase

Phase 2 will implement: Quick Entry (full numeric keypad + haptics), Transaction List, Dashboard with charts, and the TanStack Query hooks for transactions/categories/accounts.
