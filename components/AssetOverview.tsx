"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppProvider";
import { supabase, type Account, type Currency, type CryptoHolding, CURRENCIES, ACCOUNT_TYPE_CONFIG, formatMoney } from "@/lib/supabase";
import type { StockHolding } from "@/lib/supabase";
import { getStockQuotes } from "@/lib/stocks";
import { getCryptoPrices, type CryptoPrice, CRYPTO_SYMBOLS } from "@/lib/crypto";
import { getExchangeRates, convertCurrency, type ExchangeRates } from "@/lib/exchange";
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
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [stockValue, setStockValue] = useState(0);
  const [stockCost, setStockCost] = useState(0);
  const [stockCurrency, setStockCurrency] = useState<Currency>("USD");
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHolding[]>([]);
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, CryptoPrice>>({});
  const [loading, setLoading] = useState(true);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [cryptoDialogOpen, setCryptoDialogOpen] = useState(false);
  const [cryptoSymbol, setCryptoSymbol] = useState("BTC");
  const [cryptoQty, setCryptoQty] = useState("");
  const [cryptoBuyPrice, setCryptoBuyPrice] = useState("");

  useEffect(() => {
    if (user) loadData();
  }, [user, mainCurrency]);

  async function loadData() {
    setLoading(true);
    const [ratesData, stockRes, cryptoRes] = await Promise.all([
      getExchangeRates(mainCurrency).catch(() => null),
      supabase.from("stock_holdings").select("*").eq("user_id", user!.id),
      supabase.from("crypto_holdings").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }),
    ]);
    if (ratesData) setRates(ratesData);

    // Stocks
    if (stockRes.data && stockRes.data.length > 0) {
      try {
        const symbols = [...new Set(stockRes.data.map((s: StockHolding) => s.symbol))];
        const quotes = await getStockQuotes(symbols);
        let totalVal = 0, totalCost = 0;
        for (const h of stockRes.data as StockHolding[]) {
          const q = quotes[h.symbol];
          const cost = Number(h.buy_price) * Number(h.quantity);
          totalCost += cost;
          totalVal += q ? q.price * Number(h.quantity) : cost;
        }
        setStockValue(totalVal);
        setStockCost(totalCost);
        if (stockRes.data.length > 0) setStockCurrency(stockRes.data[0].currency);
      } catch {}
    }

    // Crypto
    if (cryptoRes.data) {
      setCryptoHoldings(cryptoRes.data);
      if (cryptoRes.data.length > 0) {
        try {
          const symbols = [...new Set(cryptoRes.data.map((c) => c.symbol))];
          const prices = await getCryptoPrices(symbols);
          setCryptoPrices(prices);
        } catch {}
      }
    }

    setLoading(false);
  }

  const cashAndDebit = accounts.filter((a) => a.type === "cash" || a.type === "debit");
  const creditCards = accounts.filter((a) => a.type === "credit");
  const investmentAccounts = accounts.filter((a) => a.type === "investment");
  const rateMap = rates?.rates || { CNY: 1, USD: 0.137, HKD: 1.07 };

  // Crypto totals
  let totalCryptoValue = 0;
  let totalCryptoCost = 0;
  for (const h of cryptoHoldings) {
    const price = cryptoPrices[h.symbol]?.usd || 0;
    totalCryptoValue += price * Number(h.quantity);
    totalCryptoCost += Number(h.buy_price) * Number(h.quantity);
  }

  // Net worth
  let totalNetWorth = 0;
  for (const acc of accounts) {
    totalNetWorth += convertCurrency(Number(acc.balance), acc.currency, mainCurrency, rateMap);
  }
  if (stockValue > 0) totalNetWorth += convertCurrency(stockValue, stockCurrency, mainCurrency, rateMap);
  if (totalCryptoValue > 0) totalNetWorth += convertCurrency(totalCryptoValue, "USD", mainCurrency, rateMap);

  async function handleAddCrypto() {
    if (!user || !cryptoQty || !cryptoBuyPrice) { toast.error("请填写完整"); return; }
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
      loadData();
    }
  }

  async function handleDeleteCrypto(id: string) {
    if (!confirm("删除这个持仓？")) return;
    await supabase.from("crypto_holdings").delete().eq("id", id);
    setCryptoHoldings((prev) => prev.filter((h) => h.id !== id));
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

      {/* Cash & Debit */}
      {cashAndDebit.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            <Landmark className="h-3.5 w-3.5" /> 储蓄与支付
          </div>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {cashAndDebit.map((acc, i) => (
                <button key={acc.id} onClick={() => { setEditAccount(acc); setManagerOpen(true); }}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors active:bg-muted ${i > 0 ? "border-t" : ""}`}>
                  <span className="text-2xl">{acc.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">{acc.name}</div>
                    <div className="text-[10px] text-muted-foreground">{CURRENCIES[acc.currency].name}</div>
                  </div>
                  <div className="font-semibold tabular-nums text-sm">{formatMoney(Number(acc.balance), acc.currency)}</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Credit Cards */}
      {creditCards.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> 信用卡
          </div>
          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {creditCards.map((acc, i) => {
                const bal = Number(acc.balance);
                return (
                  <button key={acc.id} onClick={() => { setEditAccount(acc); setManagerOpen(true); }}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors ${i > 0 ? "border-t" : ""}`}>
                    <span className="text-2xl">{acc.icon}</span>
                    <div className="flex-1 text-left"><div className="text-sm font-medium">{acc.name}</div></div>
                    <div className="text-right">
                      <div className={`font-semibold tabular-nums text-sm ${bal < 0 ? "text-red-600" : ""}`}>
                        {bal < 0 ? "-" : ""}{formatMoney(bal, acc.currency)}
                      </div>
                      {bal < 0 && <div className="text-[10px] text-red-500">待还</div>}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Investments: Stocks */}
      {stockValue > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> 股票
          </div>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">📈</span>
                  <span className="text-sm font-medium">股票组合</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-sm">{formatMoney(stockValue, stockCurrency)}</div>
                  <div className={`text-xs font-medium tabular-nums ${stockValue >= stockCost ? "text-emerald-600" : "text-red-600"}`}>
                    {stockValue >= stockCost ? "+" : ""}{(stockValue - stockCost).toFixed(2)}
                    {stockCost > 0 && ` (${(((stockValue - stockCost) / stockCost) * 100).toFixed(1)}%)`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

        {cryptoHoldings.length === 0 ? (
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
            {/* Crypto summary */}
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
                {cryptoHoldings.map((h, i) => {
                  const price = cryptoPrices[h.symbol]?.usd || 0;
                  const change24h = cryptoPrices[h.symbol]?.usd_24h_change || 0;
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
      {rates && (
        <Card className="mb-4 border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
              <DollarSign className="h-3.5 w-3.5" /> 实时汇率
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {(["CNY", "USD", "HKD"] as Currency[]).map((c) => (
                <div key={c}>
                  <div className="text-xs text-muted-foreground">{CURRENCIES[c].name}</div>
                  <div className="font-bold tabular-nums text-sm">{c === mainCurrency ? "1.0000" : (rateMap[c] || 0).toFixed(4)}</div>
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
            <Button onClick={handleAddCrypto} className="w-full rounded-xl">确认添加</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AccountManager open={managerOpen} onOpenChange={setManagerOpen} editAccount={editAccount} />
    </div>
  );
}
