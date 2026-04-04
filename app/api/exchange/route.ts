import { NextRequest, NextResponse } from "next/server";

const TIMEOUT_MS = 8000;
const VALID_CURRENCIES = new Set(["CNY", "USD", "HKD"]);

// In-memory cache keyed by base currency
const rateCache = new Map<string, { base: string; rates: Record<string, number>; updated: string; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const base = request.nextUrl.searchParams.get("base") || "CNY";

  // Input validation: must be a valid currency code
  if (!/^[A-Z]{3}$/.test(base)) {
    return NextResponse.json({ error: "Invalid currency code" }, { status: 400 });
  }

  // Check per-base cache
  const cached = rateCache.get(base);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({
      base: cached.base,
      rates: cached.rates,
      updated: cached.updated,
    });
  }

  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${base}`,
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      // Return stale cache if available
      if (cached) {
        return NextResponse.json({
          base: cached.base,
          rates: cached.rates,
          updated: cached.updated,
          stale: true,
        });
      }
      return NextResponse.json(
        { error: "Exchange rate service unavailable" },
        { status: 503 }
      );
    }

    const data = await res.json();

    if (!data.rates) {
      return NextResponse.json(
        { error: "Invalid response from exchange rate API" },
        { status: 502 }
      );
    }

    const relevantRates: Record<string, number> = {};
    for (const currency of ["CNY", "USD", "HKD"]) {
      if (data.rates[currency] != null) {
        relevantRates[currency] = data.rates[currency];
      } else {
        console.warn(`Missing exchange rate for ${currency} with base ${base}`);
        relevantRates[currency] = 1;
      }
    }

    const result = {
      base,
      rates: relevantRates,
      updated: data.time_last_update_utc || new Date().toISOString(),
    };

    rateCache.set(base, { ...result, fetchedAt: Date.now() });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Exchange rate API error:", error);

    // Return stale cache if available
    if (cached) {
      return NextResponse.json({
        base: cached.base,
        rates: cached.rates,
        updated: cached.updated,
        stale: true,
      });
    }

    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Exchange rate request timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Exchange rate service unavailable" }, { status: 503 });
  }
}
