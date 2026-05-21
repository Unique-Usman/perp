import Heap from "heap-js";
import type { Users, Orderbooks, Fills, Market } from "./types";

class GlobalState {
  users: Users = [];
  market: Array<string> = [];
  orderBooks: Orderbooks = {
    SOL: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
    ETH: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
    BTC: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),

      lastTradedPrice: 0,
      indexPrice: 0,
    },
    USD: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
    USDT: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
  };
  fills: Fills = [];

  addToUserPostion(
    market: Market,
    type: "LONG" | "SHORT",
    qty: number,
    margin: number,
    userId: string,
    price: number,
  ) {
    // Implement netting logic:
    // - If same-side position exists, aggregate by weighted average.
    // - If opposite-side exists, net quantities: realize PnL for closed portion,
    //   release proportional margin back to user's available collateral,
    //   and create any remaining position for the incoming side.
    const user = this.users.find((user) => user.userId === userId);
    if (!user) return;

    const position = user.positions.find(
      (position) => position.market === market,
    );

    // No existing position: create new
    if (!position) {
      const leveragePrice = (price * qty) / margin || 0;
      const liquidationPrice = leveragePrice
        ? type === "LONG"
          ? price * (1 - 1 / leveragePrice)
          : price * (1 + 1 / leveragePrice)
        : 0;

      user.positions.push({
        averagePrice: price,
        liquidationPrice,
        market,
        type,
        pnL: 0,
        margin,
        qty,
      });

      return;
    }

    // Same side: aggregate by weighted average
    if (position.type === type) {
      const currentQty = position.qty;
      const currentPrice = position.averagePrice;
      const currentMargin = position.margin;

      const newAvgPrice =
        (currentPrice * currentQty + price * qty) / (currentQty + qty);
      const newQty = currentQty + qty;
      const newMargin = currentMargin + margin;
      const leveragePrice = (newAvgPrice * newQty) / newMargin || 0;
      const liquidationPrice = leveragePrice
        ? type === "LONG"
          ? newAvgPrice * (1 - 1 / leveragePrice)
          : newAvgPrice * (1 + 1 / leveragePrice)
        : 0;

      position.averagePrice = newAvgPrice;
      position.qty = newQty;
      position.margin = newMargin;
      position.liquidationPrice = liquidationPrice;

      return;
    }

    // Opposite side: net quantities
    const existingQty = position.qty;
    const closedQty = Math.min(qty, existingQty);

    // Realized PnL for the closed portion
    let realizedPnl = 0;
    if (position.type === "LONG") {
      realizedPnl = (price - position.averagePrice) * closedQty;
    } else {
      realizedPnl = (position.averagePrice - price) * closedQty;
    }

    // Release proportional margin from the existing position
    const releasedMargin = (position.margin * closedQty) / position.qty;

    // Credit user collateral with released margin + realized PnL
    user.collateral.available += releasedMargin + realizedPnl;

    // Reduce existing position
    position.qty = position.qty - closedQty;
    position.margin = position.margin - releasedMargin;

    // If existing position fully closed, remove it
    if (position.qty === 0) {
      user.positions = user.positions.filter((p) => p !== position);
    }

    const remainingIncomingQty = qty - closedQty;

    // If some incoming quantity remains, create a new position on incoming side
    if (remainingIncomingQty > 0) {
      const incomingMarginForRemaining = (margin * remainingIncomingQty) / qty;
      const leveragePrice =
        (price * remainingIncomingQty) / incomingMarginForRemaining || 0;
      const liquidationPrice = leveragePrice
        ? type === "LONG"
          ? price * (1 - 1 / leveragePrice)
          : price * (1 + 1 / leveragePrice)
        : 0;

      user.positions.push({
        averagePrice: price,
        liquidationPrice,
        market,
        type,
        pnL: 0,
        margin: incomingMarginForRemaining,
        qty: remainingIncomingQty,
      });
    }
  }

  //TODO: calculate the liquidation if new position partially filled the exisiting position
}

const globalState = new GlobalState();
export default globalState;
