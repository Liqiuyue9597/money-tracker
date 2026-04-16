import { supabase } from "@/lib/supabase";

/** Execute an atomic buy operation via Supabase RPC */
export async function executeBuy(params: {
  table: "stock_holdings" | "crypto_holdings";
  holdingId: string;
  oldQty: number;
  oldPrice: number;
  buyQty: number;
  buyPrice: number;
  accountId: string;
}) {
  const newQty = params.oldQty + params.buyQty;
  const newAvgCost =
    (params.oldQty * params.oldPrice + params.buyQty * params.buyPrice) / newQty;
  const deductAmount = params.buyQty * params.buyPrice;

  const rpcName = params.table === "stock_holdings" ? "buy_holding" : "buy_crypto";

  const { error } = await supabase.rpc(rpcName, {
    p_holding_id: params.holdingId,
    p_new_qty: newQty,
    p_new_buy_price: newAvgCost,
    p_account_id: params.accountId,
    p_deduct_amount: deductAmount,
  });

  if (error) throw error;
}

/** Execute an atomic sell operation via Supabase RPC */
export async function executeSell(params: {
  table: "stock_holdings" | "crypto_holdings";
  holdingId: string;
  currentQty: number;
  sellQty: number;
  sellPrice: number;
  accountId: string;
  isClearAll: boolean;
}) {
  const receiveAmount = params.sellQty * params.sellPrice;

  if (params.isClearAll) {
    const rpcName = params.table === "stock_holdings" ? "sell_all_holding" : "sell_all_crypto";
    const { error } = await supabase.rpc(rpcName, {
      p_holding_id: params.holdingId,
      p_account_id: params.accountId,
      p_receive_amount: receiveAmount,
    });
    if (error) throw error;
  } else {
    const newQty = params.currentQty - params.sellQty;
    const rpcName = params.table === "stock_holdings" ? "sell_holding" : "sell_crypto";
    const { error } = await supabase.rpc(rpcName, {
      p_holding_id: params.holdingId,
      p_new_qty: newQty,
      p_account_id: params.accountId,
      p_receive_amount: receiveAmount,
    });
    if (error) throw error;
  }
}
