"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { TransactionList } from "@/components/TransactionList";
import { BottomNav } from "@/components/BottomNav";

export default function TransactionsPage() {
  const { user, loading } = useApp();

  if (loading) return null;
  if (!user) return <AuthForm />;

  return (
    <main className="flex-1 pb-20">
      <TransactionList />
      <BottomNav />
    </main>
  );
}
