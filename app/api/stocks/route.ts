import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "Missing symbols parameter" }, { status: 400 });
  }

  try {
    // Use Yahoo Finance v8 API
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 300 }, // cache 5 minutes
    });

    if (!res.ok) {
      // Fallback: try v7 quote API
      const fallbackUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 300 },
      });

      if (!fallbackRes.ok) {
        throw new Error(`Yahoo Finance API error: ${fallbackRes.status}`);
      }

      const fallbackData = await fallbackRes.json();
      const quotes: Record<string, unknown> = {};

      for (const q of fallbackData.quoteResponse?.result || []) {
        quotes[q.symbol] = {
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice || 0,
          change: q.regularMarketChange || 0,
          changePercent: q.regularMarketChangePercent || 0,
          currency: q.currency || "USD",
        };
      }

      return NextResponse.json(quotes);
    }

    const data = await res.json();
    const quotes: Record<string, unknown> = {};

    for (const [sym, sparkData] of Object.entries(data.spark?.result || [])) {
      const d = sparkData as { response?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; shortName?: string; currency?: string; symbol?: string } }> };
      const meta = d.response?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice || 0;
        const prevClose = meta.previousClose || price;
        quotes[sym] = {
          symbol: sym,
          name: meta.shortName || sym,
          price,
          change: price - prevClose,
          changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
          currency: meta.currency || "USD",
        };
      }
    }

    return NextResponse.json(quotes);
  } catch (error) {
    console.error("Stock API error:", error);
    return NextResponse.json({ error: "Failed to fetch stock data" }, { status: 500 });
  }
}
