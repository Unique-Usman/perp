import Heap from "heap-js";
import type { Users, Orderbooks, Fills, Market } from "./types";

class GlobalState {
  users: Users = [];
  market: Array<string> = [];
  orderBooks: Orderbooks = {
    SOL: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>(),
      asksHeap: new Heap<number>(),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
    ETH: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>(),
      asksHeap: new Heap<number>(),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
    BTC: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>(),
      asksHeap: new Heap<number>(),

      lastTradedPrice: 0,
      indexPrice: 0,
    },
    USD: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>(),
      asksHeap: new Heap<number>(),
      lastTradedPrice: 0,
      indexPrice: 0,
    },
    USDT: {
      bids: {},
      asks: {},
      bidsHeap: new Heap<number>(),
      asksHeap: new Heap<number>(),
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
    // TODO: Implement a netting logic, i.e when someone place a short if they have long and vice versa
    const user = this.users.find((user) => user.userId === userId);
    const position = user?.positions.find(
      (position) => position.market === market,
    );

    let currentQty;
    let currentPrice;
    let currentpnL;
    let currentLiquidationPrice;
    let currentMargin;

    if (!position) {
      currentLiquidationPrice = 0;
      currentpnL = 0;
      currentPrice = 0;
      currentQty = 0;
      currentMargin = 0;
    } else {
      currentLiquidationPrice = position.liquidationPrice;
      currentpnL = position.pnL;
      currentPrice = position.averagePrice;
      currentQty = position.qty;
      currentMargin = position.margin;
    }

    currentPrice =
      (currentPrice * currentQty + price * qty) / (currentQty + qty);
    currentQty += qty;
    currentMargin += margin;
    let leveragePrice = (currentPrice * currentQty) / currentMargin;

    if (type === "LONG") {
      currentLiquidationPrice = currentPrice * (1 - 1 / leveragePrice);
    } else {
      currentLiquidationPrice = currentPrice * (1 + 1 / leveragePrice);
    }

    if (position) {
      position.averagePrice = currentPrice;
      position.liquidationPrice = currentLiquidationPrice;
      position.margin = currentMargin;
      position.qty = currentQty;
    } else {
      user!.positions.push({
        averagePrice: currentPrice,
        liquidationPrice: currentLiquidationPrice,
        market: market,
        type: type,
        pnL: currentpnL,
        margin: currentMargin,
        qty: currentQty,
      });
    }
  }
}

const globalState = new GlobalState();
export default globalState;
