"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { StockPortfolio } from "@/components/StockPortfolio";
import { BottomNav } from "@/components/BottomNav";

export default function StocksPage() {
  const { user, loading } = useApp();

  if (loading) return null;
  if (!user) return <AuthForm />;

  return (
    <main className="flex-1 pb-20">
      <StockPortfolio />
      <BottomNav />
    </main>
  );
}
