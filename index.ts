import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { Market, Fills, Order, Orderbooks, User, Users } from "./types";
import errorHandler, { AppError } from "./middleware/errorHandler";
import notFound from "./middleware/notFound";
import authMiddleWare from "./middleware/authMiddleware";
import signUp from "./controller/signUp";
import signIn from "./controller/signIn";
import onramp from "./controller/onramp";
import globalState from "./state";
import { OrderSchema } from "./zodSchema";

const PORT = process.env.PORT;
const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "The server is up" });
});

app.post("/signup", signUp);
app.post("/signin", signIn);
app.post("/onramp", authMiddleWare, onramp);

// Need lot of work
app.post("/order", authMiddleWare, (req, res, next) => {
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const leverage = (orderData.qty * orderData.price) / orderData.equity;

  const userId = (req as Request & { user: string }).user;
  const userFound = globalState.users.find((user) => user.userId === userId);

  if (!userFound) {
    return next(new AppError("Unauthroized User", 401));
  }

  if (orderData.orderType === "market") {
    // MARKET ORDER
  } else {
    // Limit order
    // You ordered based on a price
    // We checked if it short or long.
    // if it is long order i.e buy
    // We check your equity and i.e your margin
    // we basically lock your margin to avoid double spending
    // we check if there is a match for your order.
    // if there is not match, your order sit on the orderbook.
    // if there is an match, your order will be matched and that will be your positions.
    // if it is not match, it will still be in the in your position and called open
    // if it is partially filled, we will partially filled it and marked it partially filled, while the remaining will be in the orderbook
    if (orderData.type === "LONG") {
      // orderType = Limit order and order type = LONG
      // Checking if the users has the balance
      if (orderData.equity > userFound.collateral.available) {
        return next(new AppError("Insufficient funds", 402));
      }

      // locking the equity from the collateral
      userFound.collateral.available -= orderData.equity;
      userFound.collateral.locked += orderData.equity;

      // check if there is a match or not.
      const asks = globalState.orderBooks[orderData.market]?.asks;

      const availableOrdersForTheOrderPriceAsk = asks?.[orderData.price];

      if (!availableOrdersForTheOrderPriceAsk) {
        const order: Order = {
          orderId: crypto.randomUUID(),
          market: orderData.market,
          type: orderData.type,
          qty: orderData.qty,
          margin: orderData.equity,
          orderType: orderData.orderType,
          price: orderData.price,
          status: "open",
        };

        // add to order to the list of user orders
        userFound.orders.push(order);

        // order should be added to the orderbook
        const bidsOrders =
          globalState.orderBooks[order.market]?.bids[order.price];

        if (bidsOrders) {
          bidsOrders.availableQty = (bidsOrders.availableQty ?? 0) + order.qty;
          bidsOrders.openOrders.push({
            userId,
            qty: order.qty,
            filledQty: 0,
            orderId: order.orderId,
            createdAt: new Date(),
          });
        } else {
          // no order in the orderbook for the same price
          globalState.orderBooks[order.market].bids[order.price] = {
            availableQty: order.qty,
            openOrders: [
              {
                userId,
                qty: order.qty,
                filledQty: 0,
                orderId: order.orderId,
                createdAt: new Date(),
              },
            ],
          };
        }

        // if (bids) {
        // } else {
        //   globalState.orderBooks[order.market].bids
        // }
      } else {
        if (availableOrdersForTheOrderPriceAsk.availableQty >= orderData.qty) {
          availableOrdersForTheOrderPriceAsk.availableQty -= orderData.qty;
          const openOrders = availableOrdersForTheOrderPriceAsk.openOrders;
        } else {
        }
      }
    } else {
      // orderType = Limit order and order type = SHORT
    }
  }
  // to be edited
  res.status(200).json({
    success: true,
    message: orderData,
  });
});

app.delete("/order", authMiddleWare, (req, res) => {});
app.get("/equity/available", authMiddleWare, (req, res) => {});
app.get("/positions/open/:marketId", authMiddleWare, (req, res) => {});
app.get("/positions/closed/:marketId", authMiddleWare, (req, res) => {});
app.get("/orders/open/:marketId", authMiddleWare, (req, res) => {});
app.get("/orders/:marketId", authMiddleWare, (req, res) => {});
app.get("/fills", authMiddleWare, (req, res) => {});

app.use(errorHandler);
app.use(notFound);

async function liqudationChecks(asset: string, price: number) {}

async function onPriceUpdateFromBinance(asset: string, price: number) {
  liqudationChecks(asset, price);
}

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
