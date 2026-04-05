"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
import { useMonthTransactions, type TransactionWithJoins } from "@/lib/swr-hooks";
import { supabase } from "@/lib/supabase";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export function TransactionList() {
  const { user, mainCurrency } = useApp();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");

  const { data: transactions, isLoading: loading, mutate } = useMonthTransactions(user?.id, currentMonth);

  const filtered = useMemo(
    () =>
      (transactions ?? []).filter(
        (t) =>
          !search ||
          t.note?.toLowerCase().includes(search.toLowerCase()) ||
          t.categories?.name?.toLowerCase().includes(search.toLowerCase())
      ),
    [transactions, search]
  );

  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, TransactionWithJoins[]>>((acc, t) => {
        if (!acc[t.date]) acc[t.date] = [];
        acc[t.date].push(t);
        return acc;
      }, {}),
    [filtered]
  );

  const totalExpense = useMemo(
    () => filtered.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
    [filtered]
  );
  const totalIncome = useMemo(
    () => filtered.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
    [filtered]
  );

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      // Optimistic update: remove from cached data
      mutate(
        (prev) => prev?.filter((t) => t.id !== id),
        { revalidate: false }
      );
      toast.success("已删除");
    } catch (err) {
      console.error("Failed to delete transaction:", err);
      toast.error("删除失败");
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Month Nav */}
      <div className="flex items-center justify-between py-4">
        <button
          onClick={() =>
            setCurrentMonth(
              (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
            )
          }
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold">
          {format(currentMonth, "yyyy年M月")}
        </h2>
        <button
          onClick={() =>
            setCurrentMonth(
              (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
            )
          }
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="bg-red-50 border-0 ring-0">
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground mb-1">支出</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">
              {formatMoney(totalExpense, mainCurrency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-0 ring-0">
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground mb-1">收入</p>
            <p className="text-lg font-bold text-emerald-600 tabular-nums">
              {formatMoney(totalIncome, mainCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      {/* Transactions */}
      {loading && !transactions ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          加载中...
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">暂无记录</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, items]) => {
              const dayExp = items
                .filter((t) => t.type === "expense")
                .reduce((s, t) => s + Number(t.amount), 0);
              const dayInc = items
                .filter((t) => t.type === "income")
                .reduce((s, t) => s + Number(t.amount), 0);
              const d = parseISO(date);
              const dateLabel = format(d, "M月d日 EEEE", { locale: zhCN });

              return (
                <Card key={date}>
                  <CardContent className="pt-0 pb-0">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {dateLabel}
                      </span>
                      <div className="flex gap-2 text-xs tabular-nums">
                        {dayExp > 0 && (
                          <span className="text-red-500">
                            支 {formatMoney(dayExp, mainCurrency)}
                          </span>
                        )}
                        {dayInc > 0 && (
                          <span className="text-emerald-500">
                            收 {formatMoney(dayInc, mainCurrency)}
                          </span>
                        )}
                      </div>
                    </div>

                    {items.map((t, idx) => (
                      <div key={t.id}>
                        {idx > 0 && <Separator />}
                        <div
                          className="flex items-center justify-between py-3 cursor-pointer active:opacity-50 transition-opacity"
                          onClick={() => {
                            if (confirm("删除这条记录？")) handleDelete(t.id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-lg">
                              {t.categories?.icon || "\ud83d\udccc"}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {t.categories?.name || "未分类"}
                              </p>
                              {t.note && (
                                <p className="text-xs text-muted-foreground">
                                  {t.note}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={`text-sm font-semibold tabular-nums ${
                                t.type === "income"
                                  ? "text-emerald-600"
                                  : "text-foreground"
                              }`}
                            >
                              {t.type === "expense" ? "-" : "+"}
                              {formatMoney(Number(t.amount), t.currency)}
                            </p>
                            <div className="flex items-center gap-1.5 justify-end mt-0.5">
                              {t.currency !== mainCurrency && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                  {t.currency}
                                </Badge>
                              )}
                              {t.accounts && (
                                <span className="text-[10px] text-muted-foreground">
                                  {t.accounts.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
