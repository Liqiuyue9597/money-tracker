"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { AssetOverview } from "@/components/AssetOverview";
import { BottomNav } from "@/components/BottomNav";

export default function AssetsPage() {
  const { user, loading } = useApp();

  if (loading) return null;
  if (!user) return <AuthForm />;

  return (
    <main className="flex-1 pb-20">
      <AssetOverview />
      <BottomNav />
    </main>
  );
}
