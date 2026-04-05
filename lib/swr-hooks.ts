import useSWR, { type SWRConfiguration } from "swr";
import { supabase, type Transaction, type StockHolding, type CryptoHolding } from "@/lib/supabase";
import { getStockQuotes, type StockQuote } from "@/lib/stocks";
import { getCryptoPrices, type CryptoPrice } from "@/lib/crypto";
import { getExchangeRates, type ExchangeRates } from "@/lib/exchange";
import { format, startOfMonth, endOfMonth } from "date-fns";

// ---------- shared SWR config ----------
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false, // mobile: switching tabs too often
  dedupingInterval: 30_000, // 30s dedup window
  keepPreviousData: true,   // avoid flash when key changes (e.g. month switch)
};

// ---------- transaction with joined relations ----------
export interface TransactionWithJoins extends Transaction {
  categories?: { name: string; icon: string } | null;
  accounts?: { name: string; icon: string } | null;
}

// ---------- hooks ----------

/** Monthly transactions (Dashboard + TransactionList) */
export function useMonthTransactions(userId: string | undefined, month: Date) {
  const mStart = format(startOfMonth(month), "yyyy-MM-dd");
  const mEnd = format(endOfMonth(month), "yyyy-MM-dd");

  return useSWR<TransactionWithJoins[]>(
    userId ? ["transactions", userId, mStart] : null,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, categories(name, icon), accounts(name, icon)")
        .eq("user_id", userId!)
        .gte("date", mStart)
        .lte("date", mEnd)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}

/** Year transactions (AnnualReport) */
export function useYearTransactions(userId: string | undefined, year: number) {
  return useSWR<TransactionWithJoins[]>(
    userId ? ["transactions-year", userId, year] : null,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, categories(name, icon), accounts(name, icon)")
        .eq("user_id", userId!)
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}

/** Stock holdings from Supabase */
export function useStockHoldings(userId: string | undefined) {
  return useSWR<StockHolding[]>(
    userId ? ["stock_holdings", userId] : null,
    async () => {
      const { data, error } = await supabase
        .from("stock_holdings")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}

/** Stock quotes from API. Key depends on symbols so it re-fetches when holdings change. */
export function useStockQuotes(symbols: string[]) {
  const sorted = [...symbols].sort();
  const key = sorted.length > 0 ? ["stock_quotes", ...sorted] : null;

  return useSWR<Record<string, StockQuote>>(
    key,
    async () => getStockQuotes(sorted),
    { ...defaultConfig, dedupingInterval: 60_000 }, // quotes 1 min dedup
  );
}

/** Crypto holdings from Supabase */
export function useCryptoHoldings(userId: string | undefined) {
  return useSWR<CryptoHolding[]>(
    userId ? ["crypto_holdings", userId] : null,
    async () => {
      const { data, error } = await supabase
        .from("crypto_holdings")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}

/** Crypto prices from API */
export function useCryptoPrices(symbols: string[]) {
  const sorted = [...symbols].sort();
  const key = sorted.length > 0 ? ["crypto_prices", ...sorted] : null;

  return useSWR<Record<string, CryptoPrice>>(
    key,
    async () => getCryptoPrices(sorted),
    { ...defaultConfig, dedupingInterval: 60_000 },
  );
}

/** Exchange rates for a given base currency */
export function useExchangeRates(base: string) {
  return useSWR<ExchangeRates>(
    ["exchange_rates", base],
    async () => getExchangeRates(base),
    { ...defaultConfig, dedupingInterval: 300_000 }, // 5 min (API already caches 1h)
  );
}
