"use client";

import { useState, useCallback, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type StockHolding, type Currency, type StockAssetType, CURRENCIES, formatMoney } from "@/lib/supabase";
import { useStockHoldings, useStockQuotes, useExchangeRates } from "@/lib/swr-hooks";
import { getStockQuotes, type StockQuote, getEffectivePriceForHolding } from "@/lib/stocks";
import { convertCurrency } from "@/lib/exchange";
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
import { BuyDialog } from "@/components/BuyDialog";
import { SellDialog } from "@/components/SellDialog";

/** Get type label for display */
function getTypeLabel(type: StockAssetType): string {
  switch (type) {
    case "fund": return "基金";
    case "hk": return "港股";
    case "us": return "美股";
  }
}

export function StockPortfolio() {
  const { user, mainCurrency, accounts, refreshAccounts } = useApp();

  // SWR hooks
  const { data: holdings = [], isLoading: loading, mutate: mutateHoldings } = useStockHoldings(user?.id);
  const stockSymbols = useMemo(() => [...new Set(holdings.map((h) => h.symbol))], [holdings]);
  const { data: quotes = {}, mutate: mutateQuotes, isValidating: refreshing } = useStockQuotes(stockSymbols);
  const { data: rates } = useExchangeRates(mainCurrency);

  // Build rate map for convertCurrency
  const rateMap = useMemo(() => {
    if (!rates?.rates) {
      return { CNY: 1, USD: 0.137, HKD: 1.07 };
    }
    return rates.rates;
  }, [rates]);

  const [dialogOpen, setDialogOpen] = useState(false);

  // Form states
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [holdingType, setHoldingType] = useState<StockAssetType>("us");

  // Manual price edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSymbol, setEditSymbol] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [adding, setAdding] = useState(false);

  // Expandable card state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Buy/Sell dialog state
  const [buyHolding, setBuyHolding] = useState<StockHolding | null>(null);
  const [sellHolding, setSellHolding] = useState<StockHolding | null>(null);

  async function handleRefreshQuotes() {
    if (stockSymbols.length === 0) return;
    try {
      const data = await getStockQuotes(stockSymbols);
      mutateQuotes(data, { revalidate: false });
    } catch {
      toast.error("获取行情失败");
    }
  }

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
        asset_type: holdingType,
      });

      if (error) {
        toast.error("添加失败: " + error.message);
      } else {
        toast.success(`已添加 ${symbol.toUpperCase()}`);
        setSymbol("");
        setName("");
        setBuyPrice("");
        setQuantity("");
        setHoldingType("us");
        setCurrency("USD");
        setDialogOpen(false);
        mutateHoldings(); // SWR revalidate
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("删除这个持仓？")) return;
    await supabase.from("stock_holdings").delete().eq("id", id);
    // Optimistic update
    mutateHoldings(
      (prev) => prev?.filter((h) => h.id !== id),
      { revalidate: false }
    );
  }

  function openEditDialog(sym: string, currentPrice: number) {
    setEditSymbol(sym);
    setEditPrice(currentPrice > 0 ? currentPrice.toString() : "");
    setEditDialogOpen(true);
  }

  async function handleManualPriceSave() {
    const price = parseFloat(editPrice);
    if (!editSymbol || isNaN(price) || price <= 0) {
      toast.error("请输入有效的价格");
      return;
    }

    // Find all holdings with this symbol and update their manual_price in DB
    const holdingIds = holdings.filter((h) => h.symbol === editSymbol).map((h) => h.id);
    if (holdingIds.length === 0) return;

    try {
      const { error } = await supabase
        .from("stock_holdings")
        .update({ manual_price: price, manual_price_updated_at: new Date().toISOString() })
        .in("id", holdingIds);

      if (error) {
        toast.error("保存价格失败: " + error.message);
        return;
      }

      // Optimistic update via SWR
      mutateHoldings(
        (prev) =>
          prev?.map((h) =>
            holdingIds.includes(h.id)
              ? { ...h, manual_price: price, manual_price_updated_at: new Date().toISOString() }
              : h
          ),
        { revalidate: false }
      );
      setEditDialogOpen(false);
      toast.success(`已保存 ${editSymbol} 价格为 ${price}`);
    } catch (err) {
      console.error(err);
      toast.error("保存价格失败");
    }
  }

  async function handleBuy(holdingId: string, data: { quantity: number; price: number; accountId: string }) {
    const holding = holdings.find((h) => h.id === holdingId);
    if (!holding) return;

    const oldQty = Number(holding.quantity);
    const oldPrice = Number(holding.buy_price);
    const newQty = oldQty + data.quantity;
    const newAvgCost = (oldQty * oldPrice + data.quantity * data.price) / newQty;

    try {
      // Update holding
      const { error: holdingError } = await supabase
        .from("stock_holdings")
        .update({ quantity: newQty, buy_price: newAvgCost })
        .eq("id", holdingId);

      if (holdingError) {
        toast.error("买入失败: " + holdingError.message);
        throw holdingError;
      }

      // Update account balance
      const account = accounts.find((a) => a.id === data.accountId);
      if (account) {
        const deductAmount = data.quantity * data.price;
        const newBalance = Number(account.balance) - deductAmount;
        const { error: accountError } = await supabase
          .from("accounts")
          .update({ balance: newBalance })
          .eq("id", data.accountId);

        if (accountError) {
          toast.error("账户余额更新失败: " + accountError.message);
          throw accountError;
        }
      }

      toast.success(`已买入 ${data.quantity} ${holding.symbol}`);
      mutateHoldings();
      refreshAccounts();
    } catch (err) {
      console.error("Buy failed:", err);
      throw err;
    }
  }

  async function handleSell(holdingId: string, data: { quantity: number; price: number; accountId: string; isClearAll: boolean }) {
    try {
      if (data.isClearAll) {
        const { error: holdingError } = await supabase
          .from("stock_holdings")
          .delete()
          .eq("id", holdingId);

        if (holdingError) {
          toast.error("卖出失败: " + holdingError.message);
          throw holdingError;
        }
      } else {
        const holding = holdings.find((h) => h.id === holdingId);
        if (!holding) return;
        const newQty = Number(holding.quantity) - data.quantity;
        const { error: holdingError } = await supabase
          .from("stock_holdings")
          .update({ quantity: newQty })
          .eq("id", holdingId);

        if (holdingError) {
          toast.error("卖出失败: " + holdingError.message);
          throw holdingError;
        }
      }

      const account = accounts.find((a) => a.id === data.accountId);
      if (account) {
        const receiveAmount = data.quantity * data.price;
        const newBalance = Number(account.balance) + receiveAmount;
        const { error: accountError } = await supabase
          .from("accounts")
          .update({ balance: newBalance })
          .eq("id", data.accountId);

        if (accountError) {
          toast.error("账户余额更新失败: " + accountError.message);
          throw accountError;
        }
      }

      const holding = holdings.find((h) => h.id === holdingId);
      toast.success(`已卖出 ${data.quantity} ${holding?.symbol ?? ""}`);
      setExpandedId(null);
      mutateHoldings();
      refreshAccounts();
    } catch (err) {
      console.error("Sell failed:", err);
      throw err;
    }
  }

  /** Get effective price for a symbol: API quote > manual price (from DB) > 0 */
  const getEffectivePrice = useCallback((sym: string): number => {
    const quote = quotes[sym];
    const holding = holdings.find((h) => h.symbol === sym);
    if (!holding) return 0;
    return getEffectivePriceForHolding(holding, quote);
  }, [quotes, holdings]);

  /** Group holdings by asset_type and sort by created_at */
  const groupedHoldings = useMemo(() => {
    const groups: Record<StockAssetType, StockHolding[]> = {
      fund: [],
      hk: [],
      us: [],
    };

    holdings.forEach((h) => {
      const type = h.asset_type || (() => {
        if (h.symbol.length === 6 && /^\d{6}$/.test(h.symbol)) return "fund";
        if (h.symbol.endsWith(".HK")) return "hk";
        return "us";
      })();
      groups[type].push(h);
    });

    Object.keys(groups).forEach((key) => {
      groups[key as StockAssetType].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return groups;
  }, [holdings]);

  /** Get totals for each type (converted to mainCurrency) */
  const typeTotals = useMemo(() => {
    const totals: Record<StockAssetType, { cost: number; value: number }> = {
      fund: { cost: 0, value: 0 },
      hk: { cost: 0, value: 0 },
      us: { cost: 0, value: 0 },
    };

    Object.entries(groupedHoldings).forEach(([type, items]) => {
      items.forEach((h) => {
        const cost = Number(h.buy_price) * Number(h.quantity);
        const currentPrice = getEffectivePrice(h.symbol);
        const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
        
        // Convert to mainCurrency
        const convertedCost = convertCurrency(cost, h.currency as Currency, mainCurrency, rateMap);
        const convertedValue = convertCurrency(value, h.currency as Currency, mainCurrency, rateMap);
        
        totals[type as StockAssetType].cost += convertedCost;
        totals[type as StockAssetType].value += convertedValue;
      });
    });

    return totals;
  }, [groupedHoldings, getEffectivePrice, mainCurrency, rateMap]);

  const totalCost = useMemo(() =>
    Object.values(typeTotals).reduce((sum, t) => sum + t.cost, 0),
    [typeTotals]
  );

  const totalValue = useMemo(() =>
    Object.values(typeTotals).reduce((sum, t) => sum + t.value, 0),
    [typeTotals]
  );

  const totalPnL = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  const types: StockAssetType[] = ["fund", "hk", "us"];

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">投资组合</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshQuotes}
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
                {/* Type selector */}
                <div className="flex gap-1 rounded-xl bg-muted p-1">
                  {types.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setHoldingType(type);
                        switch (type) {
                          case "fund": setCurrency("CNY"); break;
                          case "hk": setCurrency("HKD"); break;
                          case "us": setCurrency("USD"); break;
                        }
                      }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                        holdingType === type ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      {getTypeLabel(type)}
                    </button>
                  ))}
                </div>

                {/* Symbol input */}
                <Input
                  placeholder={
                    holdingType === "fund" ? "基金/股票代码 (如 000979, QQQ)" :
                    holdingType === "hk" ? "港股代码 (如 0700.HK)" :
                    "美股代码 (如 AAPL, GOOG)"
                  }
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="rounded-xl"
                />

                {/* Name input */}
                <Input
                  placeholder="名称（选填）"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl"
                />

                {/* Buy price and quantity */}
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="买入价格/净值"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    step="0.0001"
                    className="rounded-xl"
                  />
                  <Input
                    type="number"
                    placeholder="数量/份额"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    step="0.01"
                    className="rounded-xl"
                  />
                </div>

                {/* Currency selector */}
                <div className="flex gap-1 rounded-xl bg-muted p-1">
                  {(["CNY", "USD", "HKD"] as Currency[]).map((c) => (
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

                {/* Hint for manual funds */}
                {holdingType === "fund" && (
                  <p className="text-xs text-muted-foreground">
                    💡 自定义基金（如美元基金）请手动输入价格
                  </p>
                )}

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
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatMoney(totalValue, mainCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  成本 {formatMoney(totalCost, mainCurrency)}
                </div>
              </div>
              <div className={`text-right ${totalPnL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                <div className="flex items-center gap-1 text-lg font-bold tabular-nums">
                  {totalPnL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {totalPnL >= 0 ? "+" : ""}{formatMoney(totalPnL, mainCurrency)}
                </div>
                <div className="text-xs tabular-nums">{totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(2)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Holdings List - Grouped by Type */}
      {loading && holdings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : holdings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-2">📈</p>
          <p>还没有持仓记录</p>
          <p className="text-xs mt-1">点击"添加持仓"开始追踪你的投资</p>
        </div>
      ) : (
        types.map((type) => {
          const items = groupedHoldings[type];
          const totals = typeTotals[type];

          if (items.length === 0) return null;

          const pnl = totals.value - totals.cost;
          const pnlPct = totals.cost > 0 ? (pnl / totals.cost) * 100 : 0;

          return (
            <div key={type} className="mb-4">
              {/* Type Header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{getTypeLabel(type)}</span>
                  <Badge variant="secondary" className="text-xs">
                    {items.length}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {formatMoney(totals.value, mainCurrency)}
                  </div>
                  <div className={`text-[10px] font-semibold tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {pnl >= 0 ? "+" : ""}{formatMoney(pnl, mainCurrency)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                  </div>
                </div>
              </div>

              {/* Holdings for this type */}
              <div className="space-y-2">
                {items.map((h) => {
                  const quote = quotes[h.symbol];
                  const currentPrice = getEffectivePrice(h.symbol);
                  const cost = Number(h.buy_price) * Number(h.quantity);
                  const value = currentPrice > 0 ? currentPrice * Number(h.quantity) : cost;
                  
                  // Convert individual holding to mainCurrency for display
                  const convertedCost = convertCurrency(cost, h.currency as Currency, mainCurrency, rateMap);
                  const convertedValue = convertCurrency(value, h.currency as Currency, mainCurrency, rateMap);
                  
                  const individualPnL = convertedValue - convertedCost;
                  const individualPnLPct = convertedCost > 0 ? (individualPnL / convertedCost) * 100 : 0;
                  const isFund = type === "fund";
                  const isManual = !quote?.price && h.manual_price != null && h.manual_price > 0;

                  return (
                    <Card
                      key={h.id}
                      className={`border-0 shadow-sm overflow-hidden transition-all ${
                        expandedId === h.id ? "ring-1 ring-primary/20" : ""
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Clickable card header */}
                        <div
                          className="flex items-start justify-between cursor-pointer"
                          onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{h.symbol}</span>
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {h.currency}
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
                                  {formatMoney(convertedValue, mainCurrency)}
                                </div>
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  单价 {CURRENCIES[h.currency].symbol}{currentPrice.toFixed(isFund ? 4 : 2)}
                                </div>
                                <div
                                  className={`text-xs font-semibold tabular-nums ${
                                    individualPnL >= 0 ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {individualPnL >= 0 ? "+" : ""}{formatMoney(individualPnL, mainCurrency)} ({individualPnLPct >= 0 ? "+" : ""}{individualPnLPct.toFixed(2)}%)
                                </div>
                              </>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditDialog(h.symbol, 0); }}
                                className="text-xs text-primary hover:underline"
                              >
                                手动输入价格
                              </button>
                            )}
                          </div>
                          <span className={`ml-2 text-muted-foreground transition-transform ${expandedId === h.id ? "rotate-90" : ""}`}>
                            ›
                          </span>
                        </div>

                        {/* Expanded action bar */}
                        {expandedId === h.id && (
                          <div className="border-t mt-3 pt-3 flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 rounded-xl text-xs"
                              onClick={() => setBuyHolding(h)}
                            >
                              📈 买入
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 rounded-xl text-xs"
                              onClick={() => setSellHolding(h)}
                            >
                              📉 卖出
                            </Button>
                            <button
                              onClick={() => openEditDialog(h.symbol, currentPrice)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="手动更新价格"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(h.id)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* Buy Dialog */}
      {buyHolding && (
        <BuyDialog
          open={!!buyHolding}
          onOpenChange={(open) => { if (!open) setBuyHolding(null); }}
          symbol={buyHolding.symbol}
          currentQuantity={Number(buyHolding.quantity)}
          currentBuyPrice={Number(buyHolding.buy_price)}
          holdingCurrency={buyHolding.currency as Currency}
          unitLabel={buyHolding.asset_type === "fund" ? "份" : "股"}
          onConfirm={(data) => handleBuy(buyHolding.id, data)}
        />
      )}

      {/* Sell Dialog */}
      {sellHolding && (
        <SellDialog
          open={!!sellHolding}
          onOpenChange={(open) => { if (!open) setSellHolding(null); }}
          symbol={sellHolding.symbol}
          currentQuantity={Number(sellHolding.quantity)}
          currentBuyPrice={Number(sellHolding.buy_price)}
          holdingCurrency={sellHolding.currency as Currency}
          unitLabel={sellHolding.asset_type === "fund" ? "份" : "股"}
          onConfirm={(data) => handleSell(sellHolding.id, data)}
        />
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
              手动输入的价格会保存到数据库，刷新页面后仍然有效。当 API 能获取到实时行情时，将优先使用实时价格。
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
