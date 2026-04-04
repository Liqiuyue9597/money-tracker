import { NextRequest, NextResponse } from "next/server";

const TIMEOUT_MS = 8000;

// In-memory cache with last-known-good fallback
let priceCache: { prices: Record<string, { usd: number; usd_24h_change: number }>; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const VALID_IDS = new Set([
  "bitcoin", "ethereum", "solana", "dogecoin", "cardano",
  "polkadot", "matic-network", "avalanche-2", "chainlink", "uniswap",
]);

const SYMBOL_MAP: Record<string, string> = {
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

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols") || "bitcoin";

  // Input validation: max 200 chars, only valid characters
  if (symbolsParam.length > 200 || !/^[A-Za-z0-9,\-]+$/.test(symbolsParam)) {
    return NextResponse.json({ error: "Invalid symbols parameter" }, { status: 400 });
  }

  // Check cache first
  if (priceCache && Date.now() - priceCache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(priceCache.prices);
  }

  try {
    // Resolve symbols to CoinGecko IDs, filtering out unknown ones
    const ids = symbolsParam.split(",").map((s) => {
      return SYMBOL_MAP[s.toUpperCase()] || s.toLowerCase();
    }).filter((id) => VALID_IDS.has(id));

    if (ids.length === 0) {
      return NextResponse.json({ error: "No valid crypto symbols provided" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`,
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      // Return stale cache if available, otherwise 503
      if (priceCache) {
        return NextResponse.json(priceCache.prices, {
          headers: { "X-Cache-Stale": "true" },
        });
      }
      return NextResponse.json(
        { error: "Crypto price service unavailable" },
        { status: 503 }
      );
    }

    const data = await res.json();

    // Transform to our format
    const prices: Record<string, { usd: number; usd_24h_change: number }> = {};
    for (const [id, info] of Object.entries(data)) {
      const d = info as { usd?: number; usd_24h_change?: number };
      prices[id] = {
        usd: d.usd ?? 0,
        usd_24h_change: d.usd_24h_change ?? 0,
      };
    }

    priceCache = { prices, fetchedAt: Date.now() };
    return NextResponse.json(prices);
  } catch (error) {
    console.error("Crypto API error:", error);

    // Return stale cache if available
    if (priceCache) {
      return NextResponse.json(priceCache.prices, {
        headers: { "X-Cache-Stale": "true" },
      });
    }

    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Crypto price request timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Crypto price service unavailable" }, { status: 503 });
  }
}
