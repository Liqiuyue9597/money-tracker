import { NextRequest, NextResponse } from "next/server";

// In-memory cache
let rateCache: { base: string; rates: Record<string, number>; updated: string; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const base = request.nextUrl.searchParams.get("base") || "CNY";

  // Check cache
  if (rateCache && rateCache.base === base && Date.now() - rateCache.fetchedAt < CACHE_TTL) {
    return NextResponse.json({
      base: rateCache.base,
      rates: rateCache.rates,
      updated: rateCache.updated,
    });
  }

  try {
    // Use exchangerate-api.com (free, no key needed for open API)
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);

    const data = await res.json();

    const relevantRates: Record<string, number> = {
      CNY: data.rates?.CNY || 1,
      USD: data.rates?.USD || 1,
      HKD: data.rates?.HKD || 1,
    };

    const result = {
      base,
      rates: relevantRates,
      updated: data.time_last_update_utc || new Date().toISOString(),
    };

    rateCache = { ...result, fetchedAt: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Exchange rate API error:", error);
    // Return fallback rates
    return NextResponse.json({
      base,
      rates: { CNY: 1, USD: 0.137, HKD: 1.07 },
      updated: new Date().toISOString(),
      fallback: true,
    });
  }
}
