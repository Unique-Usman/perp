import { WebSocket } from "ws";
import { BinancePriceSchema } from "./zodSchema";
import type { BinancePrice, Market } from "./types";
import globalState from "./state";
import axios from "axios";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function liquidationChecks(asset: string, price: number) {
  const users = globalState.users;

  for (const user of users) {
    const positions = user.positions;
    for (const position of positions) {
      const posMarket = position.market;
      const userId = user.userId;

      if (asset !== posMarket) continue;

      if (position.type === "LONG") {
        // LONG
        if (price > position.liquidationPrice) continue;
        //TODO: Do we need a confirmation here ?
        await liquidate(
          position.averagePrice,
          position.qty,
          position.margin,
          "SHORT",
          position.market,
          "liquidation",
          userId,
        );
      } else {
        // SHORT
        if (price < position.liquidationPrice) continue;
        await liquidate(
          position.averagePrice,
          position.qty,
          position.margin,
          "LONG",
          position.market,
          "liquidation",
          userId,
        );
      }
    }
  }
  // checks all the positions.
  // check for markets.
  // if someone is positions short and the liqudationCheckPrice is greater
  // check the
  // if someone is positions long and the price is greater
  //
}

// TODO: This should be a direct function call and not http call.
async function liquidate(
  price: number,
  qty: number,
  equity: number,
  type: string,
  market: Market,
  orderType: "market" | "limit" | "liquidation",
  userId: string,
) {
  //TODO: This call should handle error better
  const baseUrl =
    process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;

  await axios.post(
    `${baseUrl}/liquidate`,
    {
      price,
      qty,
      equity,
      type,
      market,
      orderType,
      userId,
    },
    {
      headers: {
        Authorization: `Bearer ${ADMIN_SECRET}`,
      },
    },
  );
}

// constantly check the update of price on binance and liquidate when neccessary
export async function onPriceUpdateFromBinance() {
  const wss = new WebSocket(
    "wss://fstream.binance.com/market/stream?streams=btcusdt@markPrice/ethusdt@markPrice/solusdt@markPrice",
  );

  let binancePrice: BinancePrice = {
    "solusdt@markPrice": "",
    "btcusdt@markPrice": "",
    "ethusdt@markPrice": "",
  };

  wss.on("open", () => {
    console.log("Hello world from binance");
  });

  wss.onmessage = async (event) => {
    const message = BinancePriceSchema.safeParse(
      JSON.parse(event.data.toString()),
    );

    if (message.success) {
      const data = message.data;
      if (
        binancePrice[data.stream] === "" ||
        binancePrice[data.stream] !== data.data.p
      ) {
        binancePrice[data.stream] = data.data.p;
        let sym: "BTC" | "SOL" | "ETH" = data.stream
          .slice(0, 3)
          .toUpperCase() as "SOL" | "ETH" | "BTC";
        globalState.orderBooks[sym].markPrice = Number(data.data.p);
        globalState.orderBooks[sym].indexPrice = Number(data.data.i);
        await liquidationChecks(sym, Number(data.data.p));
      }
    }
  };

  wss.on("close", () => {
    setTimeout(() => {
      onPriceUpdateFromBinance();
    }, 5000);
  });

  wss.on("error", (e) => {
    console.log(e);
  });

  wss.on("ping", () => {
    wss.pong();
  });
}
