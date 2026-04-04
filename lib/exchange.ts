// Exchange rate fetching
export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  updated: string;
}

let cachedRates: ExchangeRates | null = null;
let cacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getExchangeRates(base: string = "CNY"): Promise<ExchangeRates> {
  const now = Date.now();
  if (cachedRates && cachedRates.base === base && now - cacheTime < CACHE_DURATION) {
    return cachedRates;
  }

  const res = await fetch(`/api/exchange?base=${base}`);
  if (!res.ok) throw new Error("Failed to fetch exchange rates");

  cachedRates = await res.json();
  cacheTime = now;
  return cachedRates!;
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return amount;
  // rates are relative to base currency
  const fromRate = rates[from] || 1;
  const toRate = rates[to] || 1;
  return (amount / fromRate) * toRate;
}
