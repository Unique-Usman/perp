import type { Users, Orderbooks, Fills } from "./types";

class GlobalState {
  users: Users = [];
  market: Array<string> = [];
  orderBooks: Orderbooks = {
    SOL: { bids: {}, asks: {}, lastTradedPrice: 0, indexPrice: 0 },
    ETH: { bids: {}, asks: {}, lastTradedPrice: 0, indexPrice: 0 },
    BTC: { bids: {}, asks: {}, lastTradedPrice: 0, indexPrice: 0 },
    USD: { bids: {}, asks: {}, lastTradedPrice: 0, indexPrice: 0 },
    USDT: { bids: {}, asks: {}, lastTradedPrice: 0, indexPrice: 0 },
  };
  fills: Fills = [];
}

const globalState = new GlobalState();
export default globalState;
