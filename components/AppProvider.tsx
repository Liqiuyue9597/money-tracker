"use client";

import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { supabase, type Account, type Category, type Currency } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface AppContextType {
  user: User | null;
  loading: boolean;
  categories: Category[];
  accounts: Account[];
  mainCurrency: Currency;
  setMainCurrency: (c: Currency) => void;
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
  const [mainCurrency, setMainCurrency] = useState<Currency>("CNY");

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

  // ---------- SWR for categories ----------
  const categoriesKey = user ? ["categories", user.id] : null;
  const { data: categories = [] } = useSWR<Category[]>(
    categoriesKey,
    async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user!.id)
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
    mainCurrency,
    setMainCurrency,
    refreshCategories,
    refreshAccounts,
    signIn,
    signUp,
    signOut,
  }), [user, authLoading, categories, accounts, mainCurrency, refreshCategories, refreshAccounts, signIn, signUp, signOut]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
