"use client";

import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type StockHolding, type Currency, CURRENCIES, formatMoney } from "@/lib/supabase";
import { getStockQuotes, type StockQuote } from "@/lib/stocks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

/** Check if symbol is a CN fund (6-digit number) */
function isFundSymbol(symbol: string): boolean {
  return /^\d{6}$/.test(symbol);
}

export function StockPortfolio() {
  const { user } = useApp();
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form states
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");

  // Manual price edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSymbol, setEditSymbol] = useState("");
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    if (user) loadHoldings();
  }, [user]);

  // Auto-detect currency when symbol changes
  useEffect(() => {
    const sym = symbol.trim().toUpperCase();
    if (isFundSymbol(sym)) {
      setCurrency("CNY");
    } else if (sym.endsWith(".HK")) {
      setCurrency("HKD");
    } else if (sym.length > 0) {
      setCurrency("USD");
    }
  }, [symbol]);

  async function loadHoldings() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("stock_holdings")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setHoldings(data);
      if (data.length > 0) {
        await refreshQuotes(data);
      }
    }
    setLoading(false);
  }

  const refreshQuotes = useCallback(async (h?: StockHolding[]) => {
    const list = h || holdings;
    if (list.length === 0) return;
    setRefreshing(true);
    try {
      const symbols = [...new Set(list.map((s) => s.symbol))];
      const data = await getStockQuotes(symbols);
      setQuotes(data);
    } catch {
      toast.error("获取行情失败");
    }
    setRefreshing(false);
  }, [holdings]);

  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!user || !symbol || !buyPrice || !quantity) {
      toast.error("请填写完整信息");
      return;
    }

    setAdding(true);
    try {
    const { error } = await supabase.from("stock_holdings").insert({
      user_id: user.id,
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      buy_price: parseFloat(buyPrice),
      quantity: parseFloat(quantity),
      buy_date: new Date().toISOString().split("T")[0],
      currency,
    });

    if (error) {
      toast.error("添加失败: " + error.message);
    } else {
      toast.success(`已添加 ${symbol.toUpperCase()}`);
      setSymbol("");
      setName("");
      setBuyPrice("");
      setQuantity("");
      setDialogOpen(false);
      loadHoldings();
    }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("删除这个持仓？")) return;
    await supabase.from("stock_holdings").delete().eq("id", id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }

  function openEditDialog(sym: string, currentPrice: number) {
    setEditSymbol(sym);
    setEditPrice(currentPrice > 0 ? currentPrice.toString() : "");
    setEditDialogOpen(true);
  }

  function handleManualPriceSave() {
    const price = parseFloat(editPrice);
    if (!editSymbol || isNaN(price) || price <= 0) {
      toast.error("请输入有效的价格");
      return;
    }
    setManualPrices((prev) => ({ ...prev, [editSymbol]: price }));
    setEditDialogOpen(false);
    toast.success(`已手动更新 ${editSymbol} 价格为 ${price}`);
  }

  /** Get effective price for a symbol: API quote > manual price > 0 */
  function getEffectivePrice(sym: string): number {
    const quote = quotes[sym];
    if (quote && quote.price > 0) return quote.price;
    if (manualPrices[sym]) return manualPrices[sym];
    return 0;
  }

  // Calculate totals
  let totalCost = 0;
  let totalValue = 0;

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">投资组合</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshQuotes()}
            disabled={refreshing}
            className="rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button size="sm" className="rounded-xl" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加持仓
            </Button>
            <DialogContent className="max-w-sm mx-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle>添加持仓</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="股票代码 (如 AAPL, 0700.HK) 或基金代码 (如 000979)"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="rounded-xl"
                />
                <Input
                  placeholder={isFundSymbol(symbol.trim()) ? "基金名称（选填）" : "股票名称（选填）"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder={isFundSymbol(symbol.trim()) ? "买入净值" : "买入价格"}
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    step="0.01"
                    className="rounded-xl"
                  />
                  <Input
                    type="number"
                    placeholder={isFundSymbol(symbol.trim()) ? "持有份额" : "持仓数量"}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    step="0.01"
                    className="rounded-xl"
                  />
                </div>
                <div className="flex gap-1 rounded-xl bg-muted p-1">
                  {(["USD", "HKD", "CNY"] as Currency[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                        currency === c ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      {CURRENCIES[c].name}
                    </button>
                  ))}
                </div>
                <Button onClick={handleAdd} disabled={adding} className="w-full rounded-xl">
                  {adding ? "添加中..." : "确认添加"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Portfolio Summary */}
      {holdings.length > 0 && (
        <Card className="mb-4 border-0 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground mb-1">投资组合总览</div>
            {(() => {
              totalCost = 0;
              totalValue = 0;
              holdings.forEach((h) => {
                const cost = Number(h.buy_price) * Number(h.quantity);
                const currentPrice = getEffectivePrice(h.symbol);
                const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
                totalCost += cost;
                totalValue += value;
              });
              const totalPnL = totalValue - totalCost;
              const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
              return (
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold tabular-nums">
                      ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      成本 ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className={`text-right ${totalPnL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    <div className="flex items-center gap-1 text-lg font-bold tabular-nums">
                      {totalPnL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {totalPnL >= 0 ? "+" : ""}{totalPnL.toFixed(2)}
                    </div>
                    <div className="text-xs tabular-nums">{totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(2)}%</div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Holdings List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : holdings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-2">📈</p>
          <p>还没有持仓记录</p>
          <p className="text-xs mt-1">点击"添加持仓"开始追踪你的投资</p>
        </div>
      ) : (
        <div className="space-y-3">
          {holdings.map((h) => {
            const quote = quotes[h.symbol];
            const currentPrice = getEffectivePrice(h.symbol);
            const cost = Number(h.buy_price) * Number(h.quantity);
            const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
            const pnl = value - cost;
            const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
            const isFund = quote?.isFund || isFundSymbol(h.symbol);
            const isManual = !quote?.price && manualPrices[h.symbol] !== undefined;

            return (
              <Card key={h.id} className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{h.symbol}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          {isFund ? "基金" : h.currency}
                        </Badge>
                        {isManual && (
                          <Badge variant="outline" className="text-[10px] px-1.5 text-amber-600 border-amber-300">
                            手动
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {quote?.name || h.name || h.symbol}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {Number(h.quantity)} {isFund ? "份" : "股"} × {CURRENCIES[h.currency].symbol}{Number(h.buy_price).toFixed(isFund ? 4 : 2)}
                      </div>
                    </div>
                    <div className="text-right">
                      {currentPrice > 0 ? (
                        <>
                          <div className="font-bold tabular-nums text-sm">
                            {CURRENCIES[h.currency].symbol}{currentPrice.toFixed(isFund ? 4 : 2)}
                          </div>
                          <div
                            className={`text-xs font-semibold tabular-nums ${
                              pnl >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => openEditDialog(h.symbol, 0)}
                          className="text-xs text-primary hover:underline"
                        >
                          手动输入价格
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col ml-1 gap-0.5">
                      <button
                        onClick={() => openEditDialog(h.symbol, currentPrice)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="手动更新价格"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(h.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manual Price Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>手动更新价格 — {editSymbol}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="number"
              placeholder="输入当前价格/净值"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              step="0.0001"
              className="rounded-xl"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              手动输入的价格仅在本次会话有效，刷新页面后会重新从 API 获取。
            </p>
            <Button onClick={handleManualPriceSave} className="w-full rounded-xl">
              确认更新
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
