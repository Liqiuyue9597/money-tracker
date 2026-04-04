// Crypto price fetching
export interface CryptoPrice {
  usd: number;
  usd_24h_change: number;
}

// Map symbols to CoinGecko IDs
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  DOGE: "dogecoin",
  ADA: "cardano",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  UNI: "uniswap",
};

export const CRYPTO_SYMBOLS: Record<string, { name: string; icon: string }> = {
  BTC: { name: "Bitcoin", icon: "₿" },
  ETH: { name: "Ethereum", icon: "Ξ" },
  SOL: { name: "Solana", icon: "◎" },
  DOGE: { name: "Dogecoin", icon: "Ð" },
};

export async function getCryptoPrices(symbols: string[]): Promise<Record<string, CryptoPrice>> {
  if (symbols.length === 0) return {};

  const ids = symbols.map((s) => SYMBOL_TO_ID[s.toUpperCase()] || s.toLowerCase()).join(",");
  const res = await fetch(`/api/crypto?symbols=${ids}`);
  if (!res.ok) throw new Error("Failed to fetch crypto prices");

  const data = await res.json();

  // Map back from CoinGecko IDs to our symbols
  const result: Record<string, CryptoPrice> = {};
  for (const [symbol] of symbols.map((s) => [s, SYMBOL_TO_ID[s.toUpperCase()] || s.toLowerCase()])) {
    const id = SYMBOL_TO_ID[symbol.toUpperCase()] || symbol.toLowerCase();
    if (data[id]) {
      result[symbol.toUpperCase()] = data[id];
    }
  }

  return result;
}
