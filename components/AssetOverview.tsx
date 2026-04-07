"use client";

import { useState, useMemo } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type Account, type Currency, type CryptoHolding, CURRENCIES, formatMoney } from "@/lib/supabase";
import { useStockHoldings, useStockQuotes, useCryptoHoldings, useCryptoPrices, useExchangeRates } from "@/lib/swr-hooks";
import { convertCurrency } from "@/lib/exchange";
import { CRYPTO_SYMBOLS } from "@/lib/crypto";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AccountManager } from "@/components/AccountManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Wallet, Plus, TrendingUp, TrendingDown, RefreshCw,
  DollarSign, CreditCard, Landmark, Banknote, Bitcoin, Trash2,
} from "lucide-react";

export function AssetOverview() {
  const { user, accounts, mainCurrency, refreshAccounts } = useApp();

  // SWR hooks
  const { data: rates } = useExchangeRates(mainCurrency);
  const { data: usdRates } = useExchangeRates("USD");
  const { data: holdings } = useStockHoldings(user?.id);
  const stockSymbols = useMemo(() => holdings ? [...new Set(holdings.map((h) => h.symbol))] : [], [holdings]);
  const { data: quotes } = useStockQuotes(stockSymbols);
  const { data: cryptoHoldings, mutate: mutateCrypto, isLoading: cryptoLoading } = useCryptoHoldings(user?.id);
  const cryptoSymbols = useMemo(() => cryptoHoldings ? [...new Set(cryptoHoldings.map((c) => c.symbol))] : [], [cryptoHoldings]);
  const { data: cryptoPrices } = useCryptoPrices(cryptoSymbols);

  // UI state
  const [managerOpen, setManagerOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [cryptoDialogOpen, setCryptoDialogOpen] = useState(false);
  const [cryptoSymbol, setCryptoSymbol] = useState("BTC");
  const [cryptoQty, setCryptoQty] = useState("");
  const [cryptoBuyPrice, setCryptoBuyPrice] = useState("");
  const [addingCrypto, setAddingCrypto] = useState(false);

  const loading = !holdings && !cryptoHoldings;
  const rateMap = rates?.rates || { CNY: 1, USD: 0.137, HKD: 1.07 };

  // Derive stock totals (converted to mainCurrency per holding)
  const { stockValue, stockCost, stockPnl, stockPnlPct } = useMemo(() => {
    if (!holdings || holdings.length === 0 || !quotes) return { stockValue: 0, stockCost: 0, stockPnl: 0, stockPnlPct: 0 };
    let totalVal = 0, totalCost = 0;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      const cur = (h.currency || "USD") as Currency;
      const cost = Number(h.buy_price) * Number(h.quantity);
      const val = q ? q.price * Number(h.quantity) : cost;
      totalCost += convertCurrency(cost, cur, mainCurrency, rateMap);
      totalVal += convertCurrency(val, cur, mainCurrency, rateMap);
    }
    const pnl = totalVal - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    return { stockValue: totalVal, stockCost: totalCost, stockPnl: pnl, stockPnlPct: pnlPct };
  }, [holdings, quotes, mainCurrency, rateMap]);

  // Cash accounts split
  const cashAccounts = useMemo(() => accounts.filter((a) => a.type === "cash"), [accounts]);
  const positiveAccounts = useMemo(() => cashAccounts.filter((a) => Number(a.balance) >= 0), [cashAccounts]);
  const negativeAccounts = useMemo(() => cashAccounts.filter((a) => Number(a.balance) < 0), [cashAccounts]);

  // Crypto totals
  const { totalCryptoValue, totalCryptoCost } = useMemo(() => {
    let value = 0, cost = 0;
    for (const h of (cryptoHoldings ?? [])) {
      const price = cryptoPrices?.[h.symbol]?.usd || 0;
      value += price * Number(h.quantity);
      cost += Number(h.buy_price) * Number(h.quantity);
    }
    return { totalCryptoValue: value, totalCryptoCost: cost };
  }, [cryptoHoldings, cryptoPrices]);

  // Net worth
  const totalNetWorth = useMemo(() => {
    let netWorth = 0;
    for (const acc of accounts) {
      if (!acc.exclude_from_total) {
        netWorth += convertCurrency(Number(acc.balance), acc.currency, mainCurrency, rateMap);
      }
    }
    if (stockValue > 0) netWorth += stockValue; // already in mainCurrency
    if (totalCryptoValue > 0) netWorth += convertCurrency(totalCryptoValue, "USD", mainCurrency, rateMap);
    return netWorth;
  }, [accounts, mainCurrency, rateMap, stockValue, totalCryptoValue]);

  async function handleAddCrypto() {
    if (!user || !cryptoQty || !cryptoBuyPrice) { toast.error("请填写完整"); return; }
    setAddingCrypto(true);
    try {
      const { error } = await supabase.from("crypto_holdings").insert({
        user_id: user.id,
        symbol: cryptoSymbol,
        name: CRYPTO_SYMBOLS[cryptoSymbol]?.name || cryptoSymbol,
        quantity: parseFloat(cryptoQty),
        buy_price: parseFloat(cryptoBuyPrice),
        buy_date: new Date().toISOString().split("T")[0],
      });
      if (error) { toast.error("添加失败"); } else {
        toast.success(`已添加 ${cryptoSymbol}`);
        setCryptoDialogOpen(false);
        setCryptoQty(""); setCryptoBuyPrice("");
        mutateCrypto(); // SWR revalidate
      }
    } finally {
      setAddingCrypto(false);
    }
  }

  async function handleDeleteCrypto(id: string) {
    if (!confirm("删除这个持仓？")) return;
    const { error } = await supabase.from("crypto_holdings").delete().eq("id", id);
    if (error) {
      toast.error("删除失败");
      return;
    }
    // Optimistic update
    mutateCrypto(
      (prev) => prev?.filter((h) => h.id !== id),
      { revalidate: false }
    );
    toast.success("已删除");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-xl font-bold">我的资产</h1>
        <Button size="sm" className="rounded-xl" onClick={() => { setEditAccount(null); setManagerOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> 添加账户
        </Button>
      </div>

      {/* Total */}
      <Card className="mb-4 border-0 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-5">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> 总资产（净值）
          </div>
          <div className="text-3xl font-bold tabular-nums mb-3">
            {formatMoney(totalNetWorth, mainCurrency)}
          </div>
        </CardContent>
      </Card>

      {/* Positive balance accounts */}
      {positiveAccounts.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5" /> 储蓄与支付
          </div>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {positiveAccounts.map((acc, i) => (
                <button key={acc.id} onClick={() => { setEditAccount(acc); setManagerOpen(true); }}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors active:bg-muted ${i > 0 ? "border-t" : ""}`}>
                  <span className="text-2xl">{acc.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {acc.name}
                      {acc.exclude_from_total && <span className="text-[10px] text-[#A8A29E] bg-[#F0EFED] px-1.5 py-0.5 rounded">不计入</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{CURRENCIES[acc.currency].name}</div>
                  </div>
                  <div className={`font-semibold tabular-nums text-sm ${acc.exclude_from_total ? "text-muted-foreground" : ""}`}>{formatMoney(Number(acc.balance), acc.currency)}</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Negative balance accounts */}
      {negativeAccounts.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> 待还
          </div>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {negativeAccounts.map((acc, i) => {
                const bal = Number(acc.balance);
                return (
                  <button key={acc.id} onClick={() => { setEditAccount(acc); setManagerOpen(true); }}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors ${i > 0 ? "border-t" : ""}`}>
                    <span className="text-2xl">{acc.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {acc.name}
                        {acc.exclude_from_total && <span className="text-[10px] text-[#A8A29E] bg-[#F0EFED] px-1.5 py-0.5 rounded">不计入</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-sm text-red-600">
                        -{formatMoney(bal, acc.currency)}
                      </div>
                      <div className="text-[10px] text-red-500">待还</div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stocks */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> 股票
          </div>
          <a href="/stocks" className="text-xs text-primary font-medium">
            管理
          </a>
        </div>

        {stockValue > 0 ? (
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <a href="/stocks" className="block px-4 py-3.5 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📈</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">股票组合</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      成本 {formatMoney(stockCost, mainCurrency)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-sm">{formatMoney(stockValue, mainCurrency)}</div>
                    <div className={`text-[10px] font-medium tabular-nums ${stockPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {stockPnl >= 0 ? "+" : ""}{formatMoney(stockPnl, mainCurrency)} ({stockPnl >= 0 ? "+" : ""}{stockPnlPct.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              </a>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">暂无股票持仓</p>
              <a href="/stocks">
                <Button variant="outline" size="sm" className="mt-2 rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> 添加股票
                </Button>
              </a>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Crypto */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Bitcoin className="h-3.5 w-3.5" /> 加密货币
          </div>
          <button onClick={() => setCryptoDialogOpen(true)} className="text-xs text-primary font-medium">
            + 添加
          </button>
        </div>

        {(cryptoHoldings ?? []).length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">暂无加密货币持仓</p>
              <Button variant="outline" size="sm" className="mt-2 rounded-xl" onClick={() => setCryptoDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> 添加比特币等
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {totalCryptoValue > 0 && (
              <Card className="border-0 shadow-sm mb-2 bg-amber-50/50">
                <CardContent className="p-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">加密资产总值</div>
                      <div className="text-lg font-bold tabular-nums">${totalCryptoValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className={`text-xs font-semibold tabular-nums ${totalCryptoValue >= totalCryptoCost ? "text-emerald-600" : "text-red-600"}`}>
                      {totalCryptoValue >= totalCryptoCost ? "+" : ""}{(totalCryptoValue - totalCryptoCost).toFixed(2)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {(cryptoHoldings ?? []).map((h, i) => {
                  const price = cryptoPrices?.[h.symbol]?.usd || 0;
                  const change24h = cryptoPrices?.[h.symbol]?.usd_24h_change || 0;
                  const value = price * Number(h.quantity);
                  const cost = Number(h.buy_price) * Number(h.quantity);
                  const pnl = value - cost;
                  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                  const info = CRYPTO_SYMBOLS[h.symbol];

                  return (
                    <div key={h.id} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t" : ""}`}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold text-lg">
                        {info?.icon || h.symbol.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm">{h.symbol}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5">{Number(h.quantity).toFixed(4)}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{info?.name || h.name}</div>
                      </div>
                      <div className="text-right">
                        {price > 0 ? (
                          <>
                            <div className="font-semibold tabular-nums text-sm">${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className={`text-xs tabular-nums ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">加载中</div>
                        )}
                      </div>
                      <button onClick={() => handleDeleteCrypto(h.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Exchange Rates */}
      {usdRates && (
        <Card className="mb-4 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
              <DollarSign className="h-3.5 w-3.5" /> 实时汇率（1 USD）
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {(["CNY", "USD", "HKD"] as Currency[]).map((c) => (
                <div key={c}>
                  <div className="text-xs text-muted-foreground">{CURRENCIES[c].name}</div>
                  <div className="font-bold tabular-nums text-sm">
                    {c === "USD" ? "1.0000" : (usdRates.rates[c] || 0).toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Crypto Add Dialog */}
      <Dialog open={cryptoDialogOpen} onOpenChange={setCryptoDialogOpen}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>添加加密货币</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-2">选择币种</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CRYPTO_SYMBOLS).map(([sym, info]) => (
                  <button key={sym} onClick={() => setCryptoSymbol(sym)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                      cryptoSymbol === sym ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                    {info.icon} {sym}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="持有数量" value={cryptoQty} onChange={(e) => setCryptoQty(e.target.value)} step="0.00000001" className="rounded-xl" />
              <Input type="number" placeholder="买入均价 (USD)" value={cryptoBuyPrice} onChange={(e) => setCryptoBuyPrice(e.target.value)} step="0.01" className="rounded-xl" />
            </div>
            <Button onClick={handleAddCrypto} disabled={addingCrypto} className="w-full rounded-xl">{addingCrypto ? "添加中..." : "确认添加"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AccountManager open={managerOpen} onOpenChange={setManagerOpen} editAccount={editAccount} />
    </div>
  );
}
