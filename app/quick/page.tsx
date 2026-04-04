"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { QuickEntry } from "@/components/QuickEntry";
import { BottomNav } from "@/components/BottomNav";

export default function QuickPage() {
  const { user, loading } = useApp();

  if (loading) return null;
  if (!user) return <AuthForm />;

  return (
    <main className="flex flex-col h-screen">
      <div className="flex-1 overflow-auto pb-20">
        <QuickEntry />
      </div>
      <BottomNav />
    </main>
  );
}
