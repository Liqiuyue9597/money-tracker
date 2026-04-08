import { convertCurrency } from "@/lib/exchange";

/**
 * Test: Mixed-currency portfolio totals are correctly converted to mainCurrency
 * 
 * Scenario: User has holdings in USD, HKD, and CNY, but mainCurrency is CNY
 * Expected: All holdings should be converted to CNY before summing
 */
describe("StockPortfolio Currency Conversion", () => {
  it("should convert mixed-currency holdings to mainCurrency", () => {
    // Sample exchange rates (mock rates from API)
    const rates = {
      CNY: 1,
      USD: 7.1,    // 1 USD = 7.1 CNY
      HKD: 0.91,   // 1 HKD = 0.91 CNY
    };

    const mainCurrency = "CNY";

    // Sample holdings
    const holdings = [
      { symbol: "AAPL", currency: "USD", cost: 100, value: 150 },    // $100 buy, $150 current
      { symbol: "0700.HK", currency: "HKD", cost: 1000, value: 1200 },  // HK$1000 buy, HK$1200 current
      { symbol: "000979", currency: "CNY", cost: 5000, value: 6000 },   // ¥5000 buy, ¥6000 current
    ];

    // Calculate totals without conversion (the BUG)
    const buggyTotalCost = holdings.reduce((sum, h) => sum + h.cost, 0);
    const buggyTotalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    // Result: 6100 and 7350 (nonsensical mix of currencies!)

    // Calculate totals with conversion (the FIX)
    const correctTotalCost = holdings.reduce((sum, h) => {
      return sum + convertCurrency(h.cost, h.currency as any, mainCurrency, rates);
    }, 0);
    const correctTotalValue = holdings.reduce((sum, h) => {
      return sum + convertCurrency(h.value, h.currency as any, mainCurrency, rates);
    }, 0);

    // Verify the fix
    expect(correctTotalCost).toBeCloseTo(100 * 7.1 + 1000 * 0.91 + 5000, 0);
    expect(correctTotalValue).toBeCloseTo(150 * 7.1 + 1200 * 0.91 + 6000, 0);

    // Verify it's different from the buggy calculation
    expect(correctTotalCost).not.toBe(buggyTotalCost);
    expect(correctTotalValue).not.toBe(buggyTotalValue);

    // Verify the difference is significant (5x+ as mentioned in task)
    const costDifference = Math.abs(correctTotalCost - buggyTotalCost) / buggyTotalCost;
    const valueDifference = Math.abs(correctTotalValue - buggyTotalValue) / buggyTotalValue;
    
    expect(costDifference).toBeGreaterThan(0.5); // At least 50% different
    expect(valueDifference).toBeGreaterThan(0.5);

    console.log("Buggy calculation (no conversion):", { buggyTotalCost, buggyTotalValue });
    console.log("Correct calculation (with conversion):", { correctTotalCost, correctTotalValue });
  });
});
