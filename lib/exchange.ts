// Exchange rate fetching
export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  updated: string;
}

// Per-base-currency cache to avoid race conditions
const cacheMap = new Map<string, { data: ExchangeRates; time: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getExchangeRates(base: string = "CNY"): Promise<ExchangeRates> {
  const now = Date.now();
  const cached = cacheMap.get(base);
  if (cached && now - cached.time < CACHE_DURATION) {
    return cached.data;
  }

  const res = await fetch(`/api/exchange?base=${base}`);
  if (!res.ok) throw new Error("Failed to fetch exchange rates");

  const data: ExchangeRates = await res.json();
  cacheMap.set(base, { data, time: now });
  return data;
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return amount;

  const fromRate = rates[from];
  const toRate = rates[to];

  if (fromRate == null) {
    console.warn(`Missing exchange rate for "${from}", treating as 1`);
  }
  if (toRate == null) {
    console.warn(`Missing exchange rate for "${to}", treating as 1`);
  }

  return (amount / (fromRate ?? 1)) * (toRate ?? 1);
}
