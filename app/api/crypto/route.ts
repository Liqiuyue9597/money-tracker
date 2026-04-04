import { NextRequest, NextResponse } from "next/server";

// In-memory cache
let priceCache: { prices: Record<string, { usd: number; usd_24h_change: number }>; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get("symbols") || "bitcoin";

  // Check cache
  if (priceCache && Date.now() - priceCache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(priceCache.prices);
  }

  try {
    // Use CoinGecko free API (no key needed)
    const ids = symbols.split(",").map((s) => {
      // Map common symbols to CoinGecko IDs
      const map: Record<string, string> = {
        BTC: "bitcoin",
        ETH: "ethereum",
        SOL: "solana",
        DOGE: "dogecoin",
        ADA: "cardano",
        DOT: "polkadot",
        MATIC: "matic-network",
        AVAX: "avalanche-2",
        LINK: "chainlink",
        UNI: "uniswap",
      };
      return map[s.toUpperCase()] || s.toLowerCase();
    }).join(",");

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

    const data = await res.json();

    // Transform to our format
    const prices: Record<string, { usd: number; usd_24h_change: number }> = {};
    for (const [id, info] of Object.entries(data)) {
      const d = info as { usd?: number; usd_24h_change?: number };
      prices[id] = {
        usd: d.usd || 0,
        usd_24h_change: d.usd_24h_change || 0,
      };
    }

    priceCache = { prices, fetchedAt: Date.now() };
    return NextResponse.json(prices);
  } catch (error) {
    console.error("Crypto API error:", error);
    // Fallback
    return NextResponse.json({
      bitcoin: { usd: 0, usd_24h_change: 0 },
    });
  }
}
