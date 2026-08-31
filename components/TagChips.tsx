"use client";

import { useState } from "react";
import { tagColor, TAG_MAX_PER_TX, type Tag } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";

interface Props {
  allTags: Tag[];
  selectedTagIds: string[];
  selectedNewTagNames: string[];
  onToggleExisting: (tagId: string) => void;
  onAddNew: (name: string) => void;
  onRemoveNew: (name: string) => void;
}

export function TagChips({
  allTags,
  selectedTagIds,
  selectedNewTagNames,
  onToggleExisting,
  onAddNew,
  onRemoveNew,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");

  const totalSelected = selectedTagIds.length + selectedNewTagNames.length;
  const atLimit = totalSelected >= TAG_MAX_PER_TX;

  function commitNew() {
    const name = input.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    if (atLimit) return;
    // dedupe against existing selected (by name)
    const existing = allTags.find((t) => t.name === name);
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) onToggleExisting(existing.id);
    } else if (!selectedNewTagNames.includes(name)) {
      onAddNew(name);
    }
    setInput("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {allTags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        const c = tagColor(tag.name);
        return (
          <button
            key={tag.id}
            onClick={() => {
              if (!isSelected && atLimit) return;
              onToggleExisting(tag.id);
            }}
            disabled={!isSelected && atLimit}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
              isSelected
                ? `${c.bg} ${c.fg} ring-1 ring-current`
                : `bg-muted/50 text-muted-foreground ${atLimit ? "opacity-40" : "hover:bg-muted"}`
            }`}
          >
            #{tag.name}
          </button>
        );
      })}

      {selectedNewTagNames.map((name) => {
        const c = tagColor(name);
        return (
          <span
            key={`new-${name}`}
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.bg} ${c.fg} ring-1 ring-current flex items-center gap-1`}
          >
            #{name}
            <button
              onClick={() => onRemoveNew(name)}
              aria-label={`移除 ${name}`}
              className="hover:opacity-70"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {adding ? (
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commitNew}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitNew();
            if (e.key === "Escape") {
              setInput("");
              setAdding(false);
            }
          }}
          placeholder="新标签"
          className="h-7 w-24 text-xs px-2 py-0 rounded-full"
        />
      ) : (
        <button
          onClick={() => !atLimit && setAdding(true)}
          disabled={atLimit}
          className={`text-xs px-2.5 py-1 rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground flex items-center gap-1 ${
            atLimit ? "opacity-40" : "hover:bg-muted"
          }`}
        >
          <Plus className="h-3 w-3" />
          标签
        </button>
      )}
    </div>
  );
}
