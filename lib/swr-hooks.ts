import { useMemo } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { supabase, type Transaction, type StockHolding, type CryptoHolding, type UserSetting, type RealizedGain, type Tag } from "@/lib/supabase";
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
  to_accounts?: { name: string; icon: string } | null;
  tags?: Array<{ id: string; name: string }>;
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
        .select("*, categories(name, icon), accounts:accounts!transactions_account_id_fkey(name, icon), transaction_tags(tag:tags(id, name))")
        .eq("user_id", userId!)
        .gte("date", mStart)
        .lte("date", mEnd)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Flatten transaction_tags → tags array
      type RowWithJoins = TransactionWithJoins & {
        transaction_tags?: Array<{ tag: { id: string; name: string } | null }> | null;
      };
      const rows: TransactionWithJoins[] = (data ?? []).map((raw) => {
        const r = raw as unknown as RowWithJoins;
        const tags = (r.transaction_tags ?? [])
          .map((tt) => tt.tag)
          .filter((t): t is { id: string; name: string } => !!t);
        // strip raw join field
        const { transaction_tags: _ignored, ...rest } = r;
        void _ignored;
        return { ...rest, tags };
      });

      // Fetch to_accounts separately for transfer transactions
      if (rows.length > 0) {
        const toAccountIds = rows
          .filter((t) => t.to_account_id)
          .map((t) => t.to_account_id!);

        if (toAccountIds.length > 0) {
          const { data: toAccounts, error: toError } = await supabase
            .from("accounts")
            .select("id, name, icon")
            .in("id", toAccountIds);

          if (toError) throw toError;

          const toAccountsMap = new Map(
            (toAccounts || []).map((a) => [a.id, { name: a.name, icon: a.icon }])
          );

          return rows.map((t) => ({
            ...t,
            to_accounts: t.to_account_id ? toAccountsMap.get(t.to_account_id) || null : null,
          }));
        }
      }

      return rows;
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
        .select("*, categories(name, icon), accounts:accounts!transactions_account_id_fkey(name, icon)")
        .eq("user_id", userId!)
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`)
        .order("date", { ascending: true });
      if (error) throw error;
      
      // Fetch to_accounts separately for transfer transactions
      if (data && data.length > 0) {
        const toAccountIds = data
          .filter(t => t.to_account_id)
          .map(t => t.to_account_id!);
        
        if (toAccountIds.length > 0) {
          const { data: toAccounts, error: toError } = await supabase
            .from("accounts")
            .select("id, name, icon")
            .in("id", toAccountIds);
          
          if (toError) throw toError;
          
          const toAccountsMap = new Map(
            (toAccounts || []).map(a => [a.id, { name: a.name, icon: a.icon }])
          );
          
          return data.map(t => ({
            ...t,
            to_accounts: t.to_account_id ? toAccountsMap.get(t.to_account_id) || null : null,
          }));
        }
      }
      
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

/** Stock quotes from API. Key depends on symbols so it re-fetches when holdings change.
 *  Persists last-fetched quotes to localStorage (keyed by userId + symbols) so the
 *  component can render stale-but-real data while the fresh fetch is in flight.
 */
export function useStockQuotes(symbols: string[], userId?: string) {
  const sorted = [...symbols].sort();
  const key = sorted.length > 0 ? ["stock_quotes", ...sorted] : null;

  const cacheKey = userId && sorted.length > 0
    ? `stock_quotes_cache:${userId}:${sorted.join(",")}`
    : null;

  const fallbackData = useMemo<Record<string, StockQuote> | undefined>(() => {
    if (!cacheKey) return undefined;
    try {
      if (typeof window === "undefined") return undefined;
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as Record<string, StockQuote>) : undefined;
    } catch {
      return undefined;
    }
  // cacheKey encodes all relevant dependencies (userId + sorted symbols)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return useSWR<Record<string, StockQuote>>(
    key,
    async () => getStockQuotes(sorted),
    {
      ...defaultConfig,
      dedupingInterval: 60_000,
      fallbackData,
      onSuccess(data) {
        if (!cacheKey || typeof window === "undefined") return;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // localStorage full or unavailable — fail silently
        }
      },
    },
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

/** User settings (key-value from user_settings table) */
export function useUserSettings(userId: string | undefined) {
  const { data, mutate, ...rest } = useSWR<Record<string, string>>(
    userId ? ["user_settings", userId] : null,
    async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("key, value")
        .eq("user_id", userId!);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as UserSetting[]) map[row.key] = row.value;
      return map;
    },
    defaultConfig,
  );

  const updateSetting = async (settingKey: string, value: string) => {
    const { error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: userId!,
        key: settingKey,
        value,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
    await mutate();
  };

  return { settings: data ?? {}, updateSetting, mutate, ...rest };
}

/** Realized gains — all closed positions, newest first */
export function useRealizedGains(userId: string | undefined) {
  return useSWR<RealizedGain[]>(
    userId ? ["realized_gains", userId] : null,
    async () => {
      const { data, error } = await supabase
        .from("realized_gains")
        .select("*")
        .eq("user_id", userId!)
        .order("closed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}

/** Tags — all user tags, most-used first */
export function useTags(userId: string | undefined) {
  return useSWR<Tag[]>(
    userId ? ["tags", userId] : null,
    async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", userId!)
        .order("usage_count", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}

/** Recent months' transactions — single fetch over [monthOffset..now], for trend calcs */
export function useRecentMonthsTransactions(
  userId: string | undefined,
  monthsBack: number,
) {
  const now = new Date();
  const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1));
  const end = endOfMonth(now);
  const startKey = format(start, "yyyy-MM-dd");
  const endKey = format(end, "yyyy-MM-dd");

  return useSWR<TransactionWithJoins[]>(
    userId ? ["transactions-recent", userId, startKey, endKey] : null,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, categories(name, icon), accounts:accounts!transactions_account_id_fkey(name, icon)")
        .eq("user_id", userId!)
        .gte("date", startKey)
        .lte("date", endKey)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransactionWithJoins[];
    },
    defaultConfig,
  );
}

// ---------- net_worth_snapshots ----------
export interface NetWorthSnapshot {
  id: string;
  user_id: string;
  snapshot_date: string;
  cash_cny: number;
  cash_usd: number;
  cash_hkd: number;
  brokerage_cny: number;
  brokerage_usd: number;
  brokerage_hkd: number;
  stock_cost_cny: number;
  stock_market_cny: number;
  crypto_cost_cny: number;
  crypto_market_cny: number;
  excluded_cny: number;
  excluded_usd: number;
  excluded_hkd: number;
  rate_usd_to_cny: number | null;
  rate_hkd_to_cny: number | null;
  source: "auto" | "backfill" | "manual";
}

/** Year snapshots — for annual net-worth curve */
export function useYearSnapshots(userId: string | undefined, year: number) {
  return useSWR<NetWorthSnapshot[]>(
    userId ? ["snapshots-year", userId, year] : null,
    async () => {
      const { data, error } = await supabase
        .from("net_worth_snapshots")
        .select("*")
        .eq("user_id", userId!)
        .gte("snapshot_date", `${year}-01-01`)
        .lte("snapshot_date", `${year}-12-31`)
        .order("snapshot_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    defaultConfig,
  );
}
