import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co"
  );
}

// ============ Types ============

export type Currency = "CNY" | "USD" | "HKD";
export type TransactionType = "expense" | "income";
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

export interface CryptoHolding {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  quantity: number;
  buy_price: number;
  buy_date: string;
  notes: string;
  created_at: string;
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
  note: string;
  date: string;
  created_at: string;
}

export const ACCOUNT_TYPE_CONFIG: Record<AccountType, { label: string; defaultIcon: string }> = {
  cash:   { label: "现金账户", defaultIcon: "💰" },
  stock:  { label: "股票",     defaultIcon: "📈" },
  crypto: { label: "加密货币", defaultIcon: "₿" },
};

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  type: TransactionType;
  sort_order: number;
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
  created_at: string;
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

// ============ Bank / Institution Presets ============

export interface BankPreset {
  name: string;
  icon: string;
  /** Account types this preset applies to. Empty = all types. */
  types: AccountType[];
}

export const BANK_PRESETS: BankPreset[] = [
  { name: "微信支付", icon: "💬", types: ["cash"] },
  { name: "支付宝",   icon: "🔵", types: ["cash"] },
  { name: "招商银行", icon: "🏦", types: ["cash"] },
  { name: "中国银行", icon: "🏦", types: ["cash"] },
];

// ============ Default Categories ============

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

// ============ Currency Config ============

export const CURRENCIES: Record<Currency, { symbol: string; name: string; locale: string }> = {
  CNY: { symbol: "¥", name: "人民币", locale: "zh-CN" },
  USD: { symbol: "$", name: "美元", locale: "en-US" },
  HKD: { symbol: "HK$", name: "港币", locale: "zh-HK" },
};

export function formatMoney(amount: number, currency: Currency): string {
  const c = CURRENCIES[currency];
  return `${c.symbol}${Math.abs(amount).toLocaleString(c.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
