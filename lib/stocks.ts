// Stock & Fund price fetching via Tencent Finance + Eastmoney
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  isFund?: boolean;
  nav?: number; // Fund NAV (单位净值)
  estimate?: number; // Fund estimated NAV (估算净值)
  navDate?: string; // Fund NAV date
}

export async function getStockQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  if (symbols.length === 0) return {};

  const query = symbols.join(",");
  const res = await fetch(`/api/stocks?symbols=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Failed to fetch stock quotes");
  return res.json();
}

/**
 * Get the effective price for a stock holding
 * Priority: API quote price > manual_price from DB > 0 (fallback for cost calculation)
 * 
 * @param holding - The StockHolding from database
 * @param quote - The StockQuote from API (optional)
 * @returns Effective price number, or 0 if no price available
 */
export function getEffectivePriceForHolding(
  holding: { manual_price: number | null; buy_price: number },
  quote?: StockQuote
): number {
  if (quote && quote.price > 0) return quote.price;
  if (holding.manual_price != null && holding.manual_price > 0) return holding.manual_price;
  return 0;
}
