"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { SettingsPage } from "@/components/SettingsPage";
import { BottomNav } from "@/components/BottomNav";

export default function SettingsPageRoute() {
  const { user, loading } = useApp();

  if (loading) return null;
  if (!user) return <AuthForm />;

  return (
    <main className="flex-1 pb-20">
      <SettingsPage />
      <BottomNav />
    </main>
  );
}
