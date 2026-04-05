"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type TransactionType, type Category } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const CATEGORY_ICONS = [
  "🍜", "🚗", "🛍️", "🏠", "🎮", "💊",
  "📚", "📱", "👔", "✈️", "🎉", "📌",
  "💰", "🎁", "📈", "💼", "🧧", "☕",
  "🍺", "🐱", "🎬", "💇", "🏋️", "🎵",
  "🏥", "🧒", "🚌", "🔧", "🎓", "💝",
];

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCategory?: Category | null;
  defaultType?: TransactionType;
}

export function CategoryManager({
  open,
  onOpenChange,
  editCategory,
  defaultType = "expense",
}: CategoryManagerProps) {
  const { user, refreshCategories } = useApp();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📌");
  const [type, setType] = useState<TransactionType>(defaultType);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && editCategory) {
      setName(editCategory.name);
      setIcon(editCategory.icon);
      setType(editCategory.type);
    } else if (open) {
      setName("");
      setIcon("📌");
      setType(defaultType);
    }
  }, [open, editCategory, defaultType]);

  async function handleSave() {
    if (!user || !name.trim()) {
      toast.error("请输入分类名称");
      return;
    }
    setSaving(true);
    try {
      if (editCategory) {
        const { error } = await supabase
          .from("categories")
          .update({ name: name.trim(), icon })
          .eq("id", editCategory.id);
        if (error) {
          toast.error("更新失败");
        } else {
          toast.success("已更新");
          await refreshCategories();
          onOpenChange(false);
        }
      } else {
        const { error } = await supabase.from("categories").insert({
          user_id: user.id,
          name: name.trim(),
          icon,
          type,
          sort_order: 99,
          usage_count: 0,
        });
        if (error) {
          toast.error("创建失败");
        } else {
          toast.success(`已添加「${name.trim()}」`);
          await refreshCategories();
          onOpenChange(false);
        }
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editCategory) return;
    if (editCategory.usage_count > 0) {
      toast.error(`该分类已有 ${editCategory.usage_count} 笔记录，无法删除`);
      return;
    }
    if (!confirm(`删除分类「${editCategory.name}」？`)) return;
    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", editCategory.id);
      if (error) {
        toast.error("删除失败");
      } else {
        toast.success("已删除");
        await refreshCategories();
        onOpenChange(false);
      }
    } catch {
      toast.error("删除失败");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto rounded-lg border-hairline bg-[#FAFAFA]">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] font-semibold tracking-tight">
            {editCategory ? "编辑分类" : "添加分类"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Type selector — only for new categories */}
          {!editCategory && (
            <div>
              <div className="section-label mb-2">类型</div>
              <div className="flex gap-4">
                <button
                  onClick={() => setType("expense")}
                  className="relative pb-1"
                >
                  <span
                    className={`text-[13px] transition-colors ${
                      type === "expense"
                        ? "text-[#0A0A0A] font-medium"
                        : "text-[#C4BDB4]"
                    }`}
                  >
                    支出
                  </span>
                  {type === "expense" && (
                    <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#0A0A0A]" />
                  )}
                </button>
                <button
                  onClick={() => setType("income")}
                  className="relative pb-1"
                >
                  <span
                    className={`text-[13px] transition-colors ${
                      type === "income"
                        ? "text-[#0A0A0A] font-medium"
                        : "text-[#C4BDB4]"
                    }`}
                  >
                    收入
                  </span>
                  {type === "income" && (
                    <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#0A0A0A]" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Category name */}
          <div>
            <div className="section-label mb-2">名称</div>
            <input
              placeholder="如：水果、房租、理财"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-minimal w-full"
              autoFocus
            />
          </div>

          {/* Icon picker */}
          <div>
            <div className="section-label mb-2">图标</div>
            <div className="grid grid-cols-6 gap-1.5">
              {CATEGORY_ICONS.map((emoji) => (
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

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 bg-[#0A0A0A] text-[#FAFAFA] rounded text-[14px] font-medium tracking-wide disabled:opacity-30"
          >
            {saving ? "保存中..." : editCategory ? "保存" : "添加"}
          </button>

          {/* Delete button — only for editing, and only if no transactions */}
          {editCategory && (
            <button
              onClick={handleDelete}
              className="w-full text-[13px] text-expense hover:opacity-70 transition-opacity"
            >
              {editCategory.usage_count > 0
                ? `删除（已有 ${editCategory.usage_count} 笔记录）`
                : "删除分类"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
