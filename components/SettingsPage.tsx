"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type Currency, type TransactionType, type Category, CURRENCIES } from "@/lib/supabase";
import { CategoryManager } from "@/components/CategoryManager";
import { toast } from "sonner";
import { format } from "date-fns";

export function SettingsPage() {
  const { user, mainCurrency, setMainCurrency, categories, signOut } = useApp();
  const [catTab, setCatTab] = useState<TransactionType>("expense");
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  async function handleExportCSV() {
    if (!user) return;
    try {
      const { data: transactions } = await supabase
        .from("transactions")
        .select("*, categories(name, icon)")
        .eq("user_id", user.id)
        .order("date", { ascending: false });
      if (!transactions || transactions.length === 0) { toast.error("暂无数据"); return; }
      const headers = ["日期", "类型", "分类", "金额", "币种", "备注"];
      const rows = transactions.map((t) => [
        t.date, t.type === "expense" ? "支出" : "收入",
        (t.categories as { name: string } | null)?.name || "未分类",
        t.amount, t.currency, t.note || "",
      ]);
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `moneytracker-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV 已导出");
    } catch { toast.error("导出失败"); }
  }

  async function handleExportJSON() {
    if (!user) return;
    try {
      const [txRes, stockRes] = await Promise.all([
        supabase.from("transactions").select("*, categories(name, icon)").eq("user_id", user.id).order("date", { ascending: false }),
        supabase.from("stock_holdings").select("*").eq("user_id", user.id),
      ]);
      const blob = new Blob([JSON.stringify({ exportDate: new Date().toISOString(), transactions: txRes.data || [], stockHoldings: stockRes.data || [] }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `moneytracker-${format(new Date(), "yyyy-MM-dd")}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON 已导出");
    } catch { toast.error("导出失败"); }
  }

  return (
    <div className="max-w-lg mx-auto px-5 pb-24">
      <div className="pt-4 pb-6">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">设置</h1>
      </div>

      {/* Account */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#F0EFED] flex items-center justify-center text-[14px] font-medium text-stone">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <div className="text-[14px]">{user?.email}</div>
            <div className="text-[11px] text-stone">已登录</div>
          </div>
        </div>
        <div className="mt-4" style={{ height: "0.5px", background: "#E8E6E3" }} />
      </div>

      {/* Currency */}
      <div className="mb-8">
        <div className="section-label mb-4">主币种</div>
        <div className="flex gap-6">
          {(["CNY", "USD", "HKD"] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setMainCurrency(c)}
              className="relative pb-1.5"
            >
              <span className={`text-[15px] transition-colors ${mainCurrency === c ? "text-[#0A0A0A] font-medium" : "text-[#C4BDB4]"}`}>
                {CURRENCIES[c].symbol} {CURRENCIES[c].name}
              </span>
              {mainCurrency === c && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0A0A0A]" />
              )}
            </button>
          ))}
        </div>
        <div className="mt-4" style={{ height: "0.5px", background: "#E8E6E3" }} />
      </div>

      {/* Category Management */}
      <div className="mb-8">
        <div className="section-label mb-4">分类管理</div>
        {/* Expense / Income tabs */}
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setCatTab("expense")}
            className="relative pb-1"
          >
            <span className={`text-[14px] transition-colors ${catTab === "expense" ? "text-[#0A0A0A] font-medium" : "text-[#C4BDB4]"}`}>
              支出
            </span>
            {catTab === "expense" && (
              <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#0A0A0A]" />
            )}
          </button>
          <button
            onClick={() => setCatTab("income")}
            className="relative pb-1"
          >
            <span className={`text-[14px] transition-colors ${catTab === "income" ? "text-[#0A0A0A] font-medium" : "text-[#C4BDB4]"}`}>
              收入
            </span>
            {catTab === "income" && (
              <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#0A0A0A]" />
            )}
          </button>
        </div>

        {/* Category list */}
        <div className="space-y-0.5">
          {categories
            .filter((c) => c.type === catTab)
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setEditingCategory(cat);
                  setCatDialogOpen(true);
                }}
                className="flex w-full items-center gap-3 py-2.5 text-[14px] hover:bg-[#F0EFED] rounded-lg px-2 transition-colors"
              >
                <span className="text-[18px]">{cat.icon}</span>
                <span className="flex-1 text-left">{cat.name}</span>
                {cat.usage_count > 0 && (
                  <span className="text-[11px] text-[#A8A29E] tabular-nums">{cat.usage_count} 笔</span>
                )}
                <span className="text-[#C4BDB4]">→</span>
              </button>
            ))}
        </div>

        {/* Add category button */}
        <button
          onClick={() => {
            setEditingCategory(null);
            setCatDialogOpen(true);
          }}
          className="flex w-full items-center justify-center gap-1.5 py-2.5 mt-2 text-[13px] text-[#A8A29E] hover:text-[#0A0A0A] transition-colors rounded-lg hover:bg-[#F0EFED]"
        >
          <span>+</span>
          <span>添加{catTab === "expense" ? "支出" : "收入"}分类</span>
        </button>

        <div className="mt-4" style={{ height: "0.5px", background: "#E8E6E3" }} />
      </div>

      <CategoryManager
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        editCategory={editingCategory}
        defaultType={catTab}
      />

      {/* Data */}
      <div className="mb-8">
        <div className="section-label mb-4">数据</div>
        <div className="space-y-1">
          <button onClick={handleExportCSV} className="flex w-full items-center justify-between py-3 text-[14px] hover:text-stone transition-colors">
            <span>导出 CSV</span>
            <span className="text-stone">→</span>
          </button>
          <button onClick={handleExportJSON} className="flex w-full items-center justify-between py-3 text-[14px] hover:text-stone transition-colors">
            <span>导出 JSON</span>
            <span className="text-stone">→</span>
          </button>
        </div>
        <div className="mt-2" style={{ height: "0.5px", background: "#E8E6E3" }} />
      </div>

      {/* iOS Shortcut */}
      <div className="mb-8">
        <div className="section-label mb-4">快捷指令</div>
        <div className="text-[12px] text-stone space-y-2 leading-relaxed">
          <p>1. 打开 iOS「快捷指令」App</p>
          <p>2. 创建新快捷指令，添加「打开 URL」</p>
          <p>3. 填入地址：</p>
          <code className="block font-mono text-[11px] text-[#0A0A0A] py-2" style={{ borderBottom: "1px solid #E8E6E3" }}>
            https://你的域名/quick
          </code>
          <p>4. 添加到主屏幕或小组件即可</p>
        </div>
        <div className="mt-4" style={{ height: "0.5px", background: "#E8E6E3" }} />
      </div>

      {/* Sign Out */}
      <button
        onClick={signOut}
        className="text-[14px] text-expense hover:opacity-70 transition-opacity"
      >
        退出登录
      </button>
    </div>
  );
}
