// Stock price fetching via Yahoo Finance
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

export async function getStockQuotes(symbols: string[]): Promise<Record<string, StockQuote>> {
  if (symbols.length === 0) return {};

  const query = symbols.join(",");
  const res = await fetch(`/api/stocks?symbols=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Failed to fetch stock quotes");
  return res.json();
}
