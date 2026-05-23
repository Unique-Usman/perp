import Heap from "heap-js";

type Collateral = {
  available: number;
  locked: number;
};

export type Market = "SOL" | "ETH" | "BTC";

type Position = {
  market: Market;
  type: "LONG" | "SHORT";
  qty: number;
  margin: number;
  liquidationPrice: number;
  pnL: number;
  averagePrice: number;
};

export type Order = {
  orderId: string;
  market: Market;
  type: "LONG" | "SHORT";
  qty: number;
  margin: number;
  orderType: "limit" | "market" | "liquidation";
  price: number;
  status: "filled" | "cancelled" | "partially_filled" | "open";
};

type Positions = Array<Position>;
type Orders = Array<Order>;

export type User = {
  userId: string;
  username: string;
  password: string;
  collateral: Collateral;
  positions: Positions;
  orders: Orders;
};

export type Users = Array<User>;

type Bid = {
  availableQty: number;
  openOrders: {
    userId: string;
    qty: number;
    filledQty: number;
    orderId: string;
    createdAt: Date;
  }[];
};

type Orderbook = {
  bids: Record<string, Bid>;
  asks: Record<string, Bid>;
  bidsHeap: Heap<number>;
  asksHeap: Heap<number>;
  lastTradedPrice: number;
  indexPrice: number;
  markPrice: number;
};

export type Orderbooks = Record<Market, Orderbook>;

type Fill = {
  maker: string;
  taker: string;
  market: Market;
  qty: number;
  price: number;
  long: string;
  short: string;
};

export type BinancePrice = {
  "solusdt@markPrice": string;
  "btcusdt@markPrice": string;
  "ethusdt@markPrice": string;
};

export type Fills = Array<Fill>;
