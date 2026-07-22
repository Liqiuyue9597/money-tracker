import { NextRequest, NextResponse } from "next/server";

const TIMEOUT_MS = 8000;
const TENCENT_QT_BASE = "https://qt.gtimg.cn/q=";
const DANJUAN_FUND_BASE = "https://danjuanfunds.com/djapi/fund/";

// Cache: symbol -> { data, timestamp }
const cache = new Map<
  string,
  { data: Record<string, unknown>; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Detect symbol type:
 * - "0700.HK"  → hk
 * - "000979"   → fund (6-digit pure number)
 * - "AAPL"     → us
 */
function getSymbolType(symbol: string): "hk" | "fund" | "us" {
  if (symbol.endsWith(".HK")) return "hk";
  if (/^\d{6}$/.test(symbol)) return "fund";
  return "us";
}

/**
 * Parse Tencent Finance API response for HK stocks
 * Format: v_r_hk00700="field1~field2~...~fieldN";
 */
function parseTencentHKQuote(
  raw: string,
  symbol: string
): Record<string, unknown> | null {
  const match = raw.match(/="([^"]+)"/);
  if (!match) return null;

  const fields = match[1].split("~");
  if (fields.length < 40) return null;

  const price = parseFloat(fields[3]) || 0;
  const prevClose = parseFloat(fields[4]) || 0;
  const open = parseFloat(fields[5]) || 0;
  const high = parseFloat(fields[33]) ?? price;
  const low = parseFloat(fields[34]) ?? price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol,
    name: fields[1] || symbol,
    price,
    change: parseFloat(change.toFixed(3)),
    changePercent: parseFloat(changePercent.toFixed(4)),
    previousClose: prevClose,
    high: isNaN(high) ? price : high,
    low: isNaN(low) ? price : low,
    open,
    currency: "HKD",
    isFund: false,
  };
}

/**
 * Parse Tencent Finance API response for US stocks
 * Format: v_usAAPL="field1~field2~...~fieldN";
 */
function parseTencentUSQuote(
  raw: string,
  symbol: string
): Record<string, unknown> | null {
  const match = raw.match(/="([^"]+)"/);
  if (!match) return null;

  const fields = match[1].split("~");
  if (fields.length < 40) return null;

  const price = parseFloat(fields[3]) || 0;
  const prevClose = parseFloat(fields[4]) || 0;
  const open = parseFloat(fields[5]) || 0;
  const high = parseFloat(fields[33]) ?? price;
  const low = parseFloat(fields[34]) ?? price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol,
    name: fields[1] || symbol,
    price,
    change: parseFloat(change.toFixed(3)),
    changePercent: parseFloat(changePercent.toFixed(4)),
    previousClose: prevClose,
    high: isNaN(high) ? price : high,
    low: isNaN(low) ? price : low,
    open,
    currency: fields[35] || "USD",
    isFund: false,
  };
}

/**
 * Parse Danjuan fund detail response.
 * Format: {"data":{"fd_code":"000979","fd_name":"...","fund_derived":{"end_date":"2026-07-22","unit_nav":"4.9620","nav_grtd":"-3.1238",...}}}
 * unit_nav = 单位净值, nav_grtd = 当日涨跌幅 (%), end_date = 净值发布日期
 * Failure mode: {"result_code":600001,"message":"..."} without a `data` key.
 */
function parseDanjuanFund(
  raw: string,
  symbol: string
): Record<string, unknown> | null {
  try {
    const json = JSON.parse(raw);
    const data = json?.data;
    if (!data || !data.fund_derived) return null;

    const derived = data.fund_derived;
    const nav = parseFloat(derived.unit_nav) || 0;
    const changePercent = parseFloat(derived.nav_grtd) || 0;
    if (nav <= 0) return null;

    // Danjuan doesn't expose previous NAV directly, back-compute from percentage
    const previousClose = nav / (1 + changePercent / 100);
    const change = nav - previousClose;

    return {
      symbol,
      name: data.fd_name || data.fd_full_name || symbol,
      price: nav,
      nav,
      estimate: nav,
      change: parseFloat(change.toFixed(4)),
      changePercent: parseFloat(changePercent.toFixed(4)),
      previousClose: parseFloat(previousClose.toFixed(4)),
      high: nav,
      low: nav,
      open: parseFloat(previousClose.toFixed(4)),
      currency: "CNY",
      isFund: true,
      navDate: derived.end_date || "",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch HK stock quote from Tencent Finance API
 */
async function fetchHKQuote(
  symbol: string
): Promise<Record<string, unknown> | null> {
  const code = symbol.replace(".HK", "").padStart(5, "0");
  const url = `${TENCENT_QT_BASE}r_hk${code}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;

  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder("gbk");
  const raw = decoder.decode(buffer);
  return parseTencentHKQuote(raw, symbol);
}

/**
 * Fetch US stock quote from Tencent Finance API
 */
async function fetchUSQuote(
  symbol: string
): Promise<Record<string, unknown> | null> {
  const url = `${TENCENT_QT_BASE}us${symbol}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;

  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder("gbk");
  const raw = decoder.decode(buffer);

  // Check for no-match response
  if (raw.includes("none_match")) return null;
  return parseTencentUSQuote(raw, symbol);
}

/**
 * Fetch fund NAV from Danjuan (蛋卷基金 - 雪球旗下).
 * Covers both mainland public funds (000979, 110022...) and HK Mutual Recognition
 * funds (968XXX), which Eastmoney's f10 API does not cover. Returns T+1 official NAV.
 * History: originally used fundgz.1234567.com.cn (intraday gsz) until it went offline
 * in 2026-07; briefly used Eastmoney f10/lsjz but it missed 968XXX funds.
 */
async function fetchFundQuote(
  symbol: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${DANJUAN_FUND_BASE}${symbol}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Referer: "https://danjuanfunds.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) return null;

  const raw = await res.text();
  if (raw.trim().startsWith("<")) return null;
  return parseDanjuanFund(raw, symbol);
}

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json(
      { error: "Missing symbols parameter" },
      { status: 400 }
    );
  }

  // Input validation: max 200 chars, only valid symbol characters
  if (symbols.length > 200 || !/^[A-Za-z0-9,.\-=^]+$/.test(symbols)) {
    return NextResponse.json(
      { error: "Invalid symbols parameter" },
      { status: 400 }
    );
  }

  const symbolList = symbols.split(",").filter(Boolean);
  const quotes: Record<string, unknown> = {};
  const now = Date.now();

  try {
    const fetchPromises = symbolList.map(async (rawSymbol) => {
      const sym = rawSymbol.trim().toUpperCase();

      // Check cache first
      const cached = cache.get(sym);
      if (cached && now - cached.timestamp < CACHE_TTL) {
        quotes[sym] = cached.data;
        return;
      }

      try {
        const type = getSymbolType(sym);
        let quoteData: Record<string, unknown> | null = null;

        if (type === "hk") {
          quoteData = await fetchHKQuote(sym);
        } else if (type === "fund") {
          quoteData = await fetchFundQuote(sym);
        } else {
          quoteData = await fetchUSQuote(sym);
        }

        if (!quoteData) {
          if (cached) {
            quotes[sym] = cached.data;
          } else {
            console.warn(`No data for symbol: ${sym}`);
          }
          return;
        }

        cache.set(sym, { data: quoteData, timestamp: now });
        quotes[sym] = quoteData;
      } catch (err) {
        if (cached) {
          quotes[sym] = cached.data;
        }
        console.error(`Error fetching ${sym}:`, err);
      }
    });

    await Promise.all(fetchPromises);

    return NextResponse.json(quotes);
  } catch (error) {
    console.error("Stock API error:", error);
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Stock data request timed out" },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
