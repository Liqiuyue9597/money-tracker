"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type Currency, type AccountType, CURRENCIES, ACCOUNT_TYPE_CONFIG } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const ACCOUNT_ICONS = ["💵", "🏦", "💳", "📈", "🏧", "💎", "🪙", "💴", "💶", "💷", "🏛️", "📊"];

interface AccountManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editAccount?: { id: string; name: string; type: AccountType; currency: Currency; icon: string; balance: number } | null;
}

export function AccountManager({ open, onOpenChange, editAccount }: AccountManagerProps) {
  const { user, refreshAccounts } = useApp();
  const [name, setName] = useState(editAccount?.name || "");
  const [type, setType] = useState<AccountType>(editAccount?.type || "debit");
  const [currency, setCurrency] = useState<Currency>(editAccount?.currency || "CNY");
  const [icon, setIcon] = useState(editAccount?.icon || "🏦");
  const [initialBalance, setInitialBalance] = useState(editAccount ? String(editAccount.balance) : "0");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (v && !editAccount) { setName(""); setType("debit"); setCurrency("CNY"); setIcon("🏦"); setInitialBalance("0"); }
    if (v && editAccount) { setName(editAccount.name); setType(editAccount.type); setCurrency(editAccount.currency); setIcon(editAccount.icon); setInitialBalance(String(editAccount.balance)); }
    onOpenChange(v);
  };

  async function handleSave() {
    if (!user || !name.trim()) { toast.error("请输入账户名称"); return; }
    setSaving(true);
    if (editAccount) {
      const { error } = await supabase.from("accounts").update({ name: name.trim(), type, currency, icon }).eq("id", editAccount.id);
      if (error) toast.error("更新失败"); else { toast.success("已更新"); refreshAccounts(); onOpenChange(false); }
    } else {
      const { error } = await supabase.from("accounts").insert({ user_id: user.id, name: name.trim(), type, currency, icon, balance: parseFloat(initialBalance) || 0, sort_order: 99 });
      if (error) toast.error("创建失败"); else { toast.success(`已添加「${name.trim()}」`); refreshAccounts(); onOpenChange(false); }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!editAccount || !confirm(`删除账户「${editAccount.name}」？`)) return;
    await supabase.from("accounts").update({ is_archived: true }).eq("id", editAccount.id);
    toast.success("已删除"); refreshAccounts(); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-lg border-hairline bg-[#FAFAFA]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-semibold tracking-tight">
            {editAccount ? "编辑账户" : "添加账户"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Icon picker */}
          <div>
            <div className="section-label mb-2">图标</div>
            <div className="grid grid-cols-6 gap-1.5">
              {ACCOUNT_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`flex h-9 w-9 items-center justify-center rounded text-[18px] transition-all ${
                    icon === emoji ? "bg-[#0A0A0A]" : "hover:bg-[#F0EFED]"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <input
            placeholder="账户名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-minimal w-full"
          />

          {/* Type */}
          <div>
            <div className="section-label mb-2">类型</div>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(ACCOUNT_TYPE_CONFIG) as [AccountType, { label: string; defaultIcon: string }][]).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => { setType(key); setIcon(config.defaultIcon); }}
                  className={`px-3 py-1.5 rounded text-[12px] font-medium transition-all ${
                    type === key ? "bg-[#0A0A0A] text-[#FAFAFA]" : "text-stone hover:bg-[#F0EFED]"
                  }`}
                  style={type !== key ? { border: "0.5px solid #E8E6E3" } : {}}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div>
            <div className="section-label mb-2">币种</div>
            <div className="flex gap-4">
              {(["CNY", "USD", "HKD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className="relative pb-1"
                >
                  <span className={`text-[13px] transition-colors ${currency === c ? "text-[#0A0A0A] font-medium" : "text-[#C4BDB4]"}`}>
                    {CURRENCIES[c].symbol} {CURRENCIES[c].name}
                  </span>
                  {currency === c && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#0A0A0A]" />}
                </button>
              ))}
            </div>
          </div>

          {!editAccount && (
            <div>
              <div className="section-label mb-2">初始余额</div>
              <input
                type="number"
                placeholder="0.00"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                step="0.01"
                className="input-minimal w-full font-mono"
              />
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 bg-[#0A0A0A] text-[#FAFAFA] rounded text-[14px] font-medium tracking-wide disabled:opacity-30"
          >
            {saving ? "保存中..." : editAccount ? "保存" : "添加"}
          </button>

          {editAccount && (
            <button onClick={handleDelete} className="w-full text-[13px] text-expense hover:opacity-70 transition-opacity">
              删除账户
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
