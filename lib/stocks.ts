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
