"use client";

import { useApp } from "@/components/AppProvider";
import { AuthForm } from "@/components/AuthForm";
import { AnnualReport } from "@/components/AnnualReport";
import { BottomNav } from "@/components/BottomNav";

export default function ReportPage() {
  const { user, loading } = useApp();

  if (loading) return null;
  if (!user) return <AuthForm />;

  return (
    <main className="flex-1 pb-20">
      <AnnualReport />
      <BottomNav />
    </main>
  );
}
