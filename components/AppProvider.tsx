"use client";

import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mainCurrency, setMainCurrency] = useState<Currency>("CNY");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshCategories();
      refreshAccounts();
    } else {
      setCategories([]);
      setAccounts([]);
    }
  }, [user]);

  const refreshCategories = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order");
      if (error) throw error;
      if (data) setCategories(data);
    } catch (err) {
      console.error("Failed to refresh categories:", err);
    }
  }, [user]);

  const refreshAccounts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("sort_order");
      if (error) throw error;
      if (data) setAccounts(data);
    } catch (err) {
      console.error("Failed to refresh accounts:", err);
    }
  }, [user]);

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
    loading,
    categories,
    accounts,
    mainCurrency,
    setMainCurrency,
    refreshCategories,
    refreshAccounts,
    signIn,
    signUp,
    signOut,
  }), [user, loading, categories, accounts, mainCurrency, refreshCategories, refreshAccounts, signIn, signUp, signOut]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
