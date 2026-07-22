import { NextRequest, NextResponse } from "next/server";

const TIMEOUT_MS = 8000;
const TENCENT_QT_BASE = "https://qt.gtimg.cn/q=";
const EASTMONEY_LSJZ_BASE = "https://api.fund.eastmoney.com/f10/lsjz";
const EASTMONEY_PINGZHONG_BASE = "https://fund.eastmoney.com/pingzhongdata/";

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
 * Parse Eastmoney f10/lsjz historical NAV response (T+1 official NAV)
 * Format: {"Data":{"LSJZList":[{"FSRQ":"2026-07-22","DWJZ":"4.9620","JZZZL":"-3.12",...}],...},"ErrCode":0,...}
 * DWJZ = 单位净值, JZZZL = 净值增长率 (%), FSRQ = 净值发布日期
 */
function parseEastmoneyLsjz(
  raw: string,
  symbol: string,
  name: string
): Record<string, unknown> | null {
  try {
    const data = JSON.parse(raw);
    const list = data?.Data?.LSJZList;
    if (!Array.isArray(list) || list.length === 0) return null;

    const latest = list[0];
    const nav = parseFloat(latest.DWJZ) || 0;
    const changePercent = parseFloat(latest.JZZZL) || 0;
    if (nav <= 0) return null;

    // Derive change from previous day's NAV if available, else back-compute from percentage
    const prevNav = list.length > 1 ? parseFloat(list[1].DWJZ) : nav / (1 + changePercent / 100);
    const previousClose = prevNav > 0 ? prevNav : nav;
    const change = nav - previousClose;

    return {
      symbol,
      name: name || symbol,
      price: nav,
      nav,
      estimate: nav,
      change: parseFloat(change.toFixed(4)),
      changePercent,
      previousClose,
      high: nav,
      low: nav,
      open: previousClose,
      currency: "CNY",
      isFund: true,
      navDate: latest.FSRQ || "",
    };
  } catch {
    return null;
  }
}

/**
 * Extract fund name from pingzhongdata JS file
 * Format: ...var fS_name = "景顺长城沪港深精选股票A";...
 */
function parsePingzhongName(raw: string): string {
  const match = raw.match(/var\s+fS_name\s*=\s*"([^"]+)"/);
  return match ? match[1] : "";
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
 * Fetch fund NAV from Eastmoney f10/lsjz (T+1 official NAV).
 * Fires the NAV endpoint and the name endpoint in parallel.
 * The old fundgz.1234567.com.cn/js/*.js endpoint went offline (returns 404 HTML page
 * for all fund codes as of 2026-07), so we switched to the official f10 API — no more
 * intraday estimated NAV (gsz), only the T+1 published NAV which is what you actually
 * buy/sell at anyway.
 */
async function fetchFundQuote(
  symbol: string
): Promise<Record<string, unknown> | null> {
  const referer = `https://fund.eastmoney.com/${symbol}.html`;
  const navUrl = `${EASTMONEY_LSJZ_BASE}?fundCode=${symbol}&pageIndex=1&pageSize=2`;
  const nameUrl = `${EASTMONEY_PINGZHONG_BASE}${symbol}.js`;

  const [navRes, nameRes] = await Promise.all([
    fetch(navUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Referer: referer, "User-Agent": "Mozilla/5.0" },
    }),
    fetch(nameUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Referer: referer, "User-Agent": "Mozilla/5.0" },
    }).catch(() => null),
  ]);

  if (!navRes.ok) return null;
  const navText = await navRes.text();
  // Guard against HTML error pages returning HTTP 200
  if (navText.trim().startsWith("<")) return null;

  const name = nameRes && nameRes.ok ? parsePingzhongName(await nameRes.text()) : "";
  return parseEastmoneyLsjz(navText, symbol, name);
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
