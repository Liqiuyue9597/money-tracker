"use client";

import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type Currency, type AccountType, CURRENCIES, BANK_PRESETS } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const ACCOUNT_ICONS = ["💰", "🏦", "💳", "💵", "🏧", "💎", "🪙", "💴", "💶", "💷", "🏛️", "📊"];

/** Special sentinel for "custom input" in the bank picker */
const CUSTOM_BANK = "__custom__";

interface AccountManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editAccount?: { id: string; name: string; type: AccountType; currency: Currency; icon: string; balance: number; exclude_from_total?: boolean } | null;
}

export function AccountManager({ open, onOpenChange, editAccount }: AccountManagerProps) {
  const { user, refreshAccounts } = useApp();
  const [name, setName] = useState(editAccount?.name || "");
  const [currency, setCurrency] = useState<Currency>(editAccount?.currency || "CNY");
  const [icon, setIcon] = useState(editAccount?.icon || "💰");
  const [initialBalance, setInitialBalance] = useState(editAccount ? String(editAccount.balance) : "0");
  const [excludeFromTotal, setExcludeFromTotal] = useState(editAccount?.exclude_from_total || false);
  const [saving, setSaving] = useState(false);

  // Bank/institution selection state
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [customBankName, setCustomBankName] = useState("");

  // Always show bank picker for new accounts
  const showBankPicker = !editAccount;

  const handleOpenChange = (v: boolean) => {
    if (v && !editAccount) {
      setName(""); setCurrency("CNY"); setIcon("💰"); setInitialBalance("0"); setExcludeFromTotal(false);
      setSelectedBank(null); setCustomBankName("");
    }
    if (v && editAccount) {
      setName(editAccount.name); setCurrency(editAccount.currency); setIcon(editAccount.icon); setInitialBalance(String(editAccount.balance)); setExcludeFromTotal(editAccount.exclude_from_total || false);
      setSelectedBank(null); setCustomBankName("");
    }
    onOpenChange(v);
  };

  function handleBankSelect(bankName: string) {
    if (bankName === CUSTOM_BANK) {
      setSelectedBank(CUSTOM_BANK);
      setCustomBankName("");
      setName("");
      setIcon("💰");
    } else {
      const preset = BANK_PRESETS.find((b) => b.name === bankName);
      setSelectedBank(bankName);
      if (preset) {
        setIcon(preset.icon);
        setName(preset.name);
      }
    }
  }

  function handleCustomBankNameChange(value: string) {
    setCustomBankName(value);
    setName(value.trim());
  }

  async function handleSave() {
    if (!user || !name.trim()) { toast.error("请输入账户名称"); return; }
    setSaving(true);
    const type: AccountType = "cash";
    if (editAccount) {
      const { error } = await supabase.from("accounts").update({ name: name.trim(), type: editAccount.type, currency, icon, exclude_from_total: excludeFromTotal }).eq("id", editAccount.id);
      if (error) toast.error("更新失败"); else { toast.success("已更新"); refreshAccounts(); onOpenChange(false); }
    } else {
      const { error } = await supabase.from("accounts").insert({ user_id: user.id, name: name.trim(), type, currency, icon, balance: parseFloat(initialBalance) || 0, sort_order: 99, exclude_from_total: excludeFromTotal });
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

          {/* Bank / Institution picker — always show for new accounts */}
          {showBankPicker && (
            <div>
              <div className="section-label mb-2">选择机构</div>
              <div className="grid grid-cols-3 gap-2">
                {BANK_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handleBankSelect(preset.name)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded text-[12px] font-medium transition-all ${
                      selectedBank === preset.name
                        ? "bg-[#0A0A0A] text-[#FAFAFA]"
                        : "text-stone hover:bg-[#F0EFED]"
                    }`}
                    style={selectedBank !== preset.name ? { border: "0.5px solid #E8E6E3" } : {}}
                  >
                    <span className="text-[14px]">{preset.icon}</span>
                    {preset.name}
                  </button>
                ))}
                {/* Custom option */}
                <button
                  onClick={() => handleBankSelect(CUSTOM_BANK)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded text-[12px] font-medium transition-all ${
                    selectedBank === CUSTOM_BANK
                      ? "bg-[#0A0A0A] text-[#FAFAFA]"
                      : "text-stone hover:bg-[#F0EFED]"
                  }`}
                  style={selectedBank !== CUSTOM_BANK ? { border: "0.5px solid #E8E6E3" } : {}}
                >
                  <span className="text-[14px]">✏️</span>
                  自定义
                </button>
              </div>

              {/* Custom name input */}
              {selectedBank === CUSTOM_BANK && (
                <input
                  placeholder="如：公积金、汇丰银行、Chase"
                  value={customBankName}
                  onChange={(e) => handleCustomBankNameChange(e.target.value)}
                  className="input-minimal w-full mt-3"
                  autoFocus
                />
              )}
            </div>
          )}

          {/* Account name */}
          <div>
            <div className="section-label mb-2">
              账户名称
              {showBankPicker && selectedBank && selectedBank !== CUSTOM_BANK && (
                <span className="text-[11px] text-[#A8A29E] ml-2">可修改</span>
              )}
            </div>
            <input
              placeholder={showBankPicker ? "先选择上方机构，或直接输入" : "账户名称"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-minimal w-full"
            />
          </div>

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

          {/* Exclude from total toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-[13px] font-medium text-[#0A0A0A]">不计入总资产</div>
              <div className="text-[11px] text-[#A8A29E]">如公积金等，仅展示不纳入净值</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={excludeFromTotal}
              onClick={() => setExcludeFromTotal(!excludeFromTotal)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                excludeFromTotal ? "bg-[#0A0A0A]" : "bg-[#E8E6E3]"
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                excludeFromTotal ? "translate-x-5" : "translate-x-0.5"
              } mt-0.5`} />
            </button>
          </label>

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
