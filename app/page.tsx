"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { Dashboard } from "@/components/Dashboard";
import { BottomNav } from "@/components/BottomNav";
import { RefreshCw } from "lucide-react";

export default function HomePage() {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <AuthForm />;

  return (
    <main className="flex-1">
      <Dashboard />
      <BottomNav />
    </main>
  );
}
