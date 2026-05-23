import Heap from "heap-js";
import type { Users, Orderbooks, Fills, Market } from "./types";

//TODO:update the lastTradedPrice on every order
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
      markPrice: 0,
    },
    ETH: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),
      lastTradedPrice: 0,
      indexPrice: 0,
      markPrice: 0,
    },
    BTC: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>((a, b) => b - a),
      asksHeap: new Heap<number>((a, b) => a - b),

      lastTradedPrice: 0,
      indexPrice: 0,
      markPrice: 0,
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

    if (position.qty === qty) {
      // Realized PnL for the closed portion
      let realizedPnl = 0;
      if (position.type === "LONG") {
        realizedPnl = (price - position.averagePrice) * qty;
      } else {
        realizedPnl = (position.averagePrice - price) * qty;
      }

      // Release proportional margin from the existing position
      const releasedMargin = position.margin;

      //Total margin, the released margin and the incoming margin
      const totalMargin = releasedMargin + margin;
      // Credit user collateral with released margin + realized PnL
      user.collateral.available += totalMargin + realizedPnl;
      user.collateral.locked -= totalMargin;
      user.positions = user.positions.filter((p) => p !== position);
    } else if (position.qty > qty) {
      let realizedPnl = 0;
      const closedQty = qty;
      if (position.type === "LONG") {
        realizedPnl = (price - position.averagePrice) * closedQty;
      } else {
        realizedPnl = (position.averagePrice - price) * closedQty;
      }

      // Release proportional margin from the existing position
      const releasedMargin = (position.margin * closedQty) / position.qty;

      position.qty -= qty;
      position.margin -= releasedMargin;
      //Total margin, the released margin and the incoming margin
      const totalMargin = releasedMargin + margin;
      user.collateral.available += totalMargin + realizedPnl;
      user.collateral.locked -= totalMargin;
      // updating the liquidationPrice
      const totalPriceForRemaingQty = position.averagePrice * position.qty;

      const leverage = totalPriceForRemaingQty / position.margin;

      if (position.type === "LONG") {
        position.liquidationPrice = position.averagePrice * (1 - 1 / leverage);
      } else {
        position.liquidationPrice = position.averagePrice * (1 + 1 / leverage);
      }
    } else {
      let realizedPnl = 0;
      const closedQty = position.qty;
      if (position.type === "LONG") {
        realizedPnl = (price - position.averagePrice) * closedQty;
      } else {
        realizedPnl = (position.averagePrice - price) * closedQty;
      }

      // Release proportional margin from the existing position
      const releasedIncomingMargin = (margin * closedQty) / qty;

      user.positions = user.positions.filter((p) => p !== position);
      // Total margin, the released margin and the incoming margin
      const totalMargin = position.margin + releasedIncomingMargin;
      user.collateral.available += totalMargin + realizedPnl;
      user.collateral.locked -= totalMargin;
      // updating the liquidationPrice
      const totalPriceForRemaingQty = price * (qty - position.qty);

      const leverage =
        totalPriceForRemaingQty / (margin - releasedIncomingMargin);

      const liquidationPrice = leverage
        ? type === "LONG"
          ? price * (1 - 1 / leverage)
          : price * (1 + 1 / leverage)
        : 0;

      user.positions.push({
        averagePrice: price,
        liquidationPrice,
        market,
        type,
        pnL: 0,
        margin: margin - releasedIncomingMargin,
        qty: qty - position.qty,
      });
    }
  }
}

const globalState = new GlobalState();
export default globalState;
