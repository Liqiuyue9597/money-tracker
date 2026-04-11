"use client";

import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { supabase, type Account, type Category, type Currency } from "@/lib/supabase";
import { useUserSettings } from "@/lib/swr-hooks";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";

interface AppContextType {
  user: User | null;
  loading: boolean;
  categories: Category[];
  accounts: Account[];
  mainCurrency: Currency;
  setMainCurrency: (c: Currency) => void;
  monthlyBudget: number | null;
  setMonthlyBudget: (v: number) => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

const swrOpts = { revalidateOnFocus: false, dedupingInterval: 30_000 } as const;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mainCurrencyLocal, setMainCurrencyLocal] = useState<Currency>("CNY");

  // ---------- auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ---------- user settings (from DB) ----------
  const { settings, updateSetting } = useUserSettings(user?.id);

  // Sync mainCurrency from DB on first load
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  useEffect(() => {
    if (!currencyInitialized && settings.main_currency) {
      const c = settings.main_currency as Currency;
      if (["CNY", "USD", "HKD"].includes(c)) {
        setMainCurrencyLocal(c);
      }
      setCurrencyInitialized(true);
    }
  }, [settings.main_currency, currencyInitialized]);

  // Persist currency changes to DB
  const setMainCurrency = useCallback(async (c: Currency) => {
    setMainCurrencyLocal(c); // instant local update
    try {
      await updateSetting("main_currency", c);
    } catch (err) {
      console.error("Failed to persist currency:", err);
      toast.error("保存币种失败");
    }
  }, [updateSetting]);

  // Budget — derived from settings
  const monthlyBudget = useMemo(() => {
    const raw = settings.monthly_budget;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [settings.monthly_budget]);

  const setMonthlyBudget = useCallback(async (v: number) => {
    try {
      await updateSetting("monthly_budget", String(v));
      toast.success("预算已更新");
    } catch (err) {
      console.error("Failed to save budget:", err);
      toast.error("保存预算失败");
    }
  }, [updateSetting]);

  // ---------- SWR for categories ----------
  const categoriesKey = user ? ["categories", user.id] : null;
  const { data: categories = [] } = useSWR<Category[]>(
    categoriesKey,
    async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
        .order("usage_count", { ascending: false })
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    swrOpts,
  );

  // ---------- SWR for accounts ----------
  const accountsKey = user ? ["accounts", user.id] : null;
  const { data: accounts = [] } = useSWR<Account[]>(
    accountsKey,
    async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", user!.id)
        .eq("is_archived", false)
        .order("usage_count", { ascending: false })
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    swrOpts,
  );

  // ---------- refresh helpers (same API as before) ----------
  const refreshCategories = useCallback(async () => {
    if (categoriesKey) await globalMutate(categoriesKey);
  }, [categoriesKey]);

  const refreshAccounts = useCallback(async () => {
    if (accountsKey) await globalMutate(accountsKey);
  }, [accountsKey]);

  // ---------- auth methods ----------
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    loading: authLoading,
    categories,
    accounts,
    mainCurrency: mainCurrencyLocal,
    setMainCurrency,
    monthlyBudget,
    setMonthlyBudget,
    refreshCategories,
    refreshAccounts,
    signIn,
    signUp,
    signOut,
  }), [user, authLoading, categories, accounts, mainCurrencyLocal, setMainCurrency, monthlyBudget, setMonthlyBudget, refreshCategories, refreshAccounts, signIn, signUp, signOut]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
