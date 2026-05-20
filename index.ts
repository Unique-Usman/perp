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
  const userId = (req as Request & { user: string }).user;
  const userFound = globalState.users.find((user) => user.userId === userId);

  if (!userFound) {
    return next(new AppError("Unauthroized User", 401));
  }

  if (orderData.orderType === "market") {
    // MARKET ORDER
  } else {
    // Limit order
    if (orderData.type === "LONG") {
      // orderType = Limit order and order type = LONG
      // Checking if the users has the balance
      if (orderData.equity > userFound.collateral.available) {
        return next(new AppError("Insufficient funds", 409));
      }

      // locking the equity from the collateral
      userFound.collateral.available -= orderData.equity;
      userFound.collateral.locked += orderData.equity;

      // check if there is a match or not through the minHeap.
      const asksHeap = globalState.orderBooks[orderData.market].asksHeap;

      const isPriceAbsent =
        asksHeap.isEmpty() || asksHeap.peek()! > orderData.price;

      if (isPriceAbsent) {
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

        // add order to the list of user orders
        userFound.orders.push(order);

        // order should be added to the orderbook and the price to the bidsHeap if not present
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
          globalState.orderBooks[order.market].bidsHeap.push(
            Number(order.price),
          );
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
        return res.status(201).json(order);
      } else {
        // price is present
        const fullPriceToBeDeleted: number[] = [];
        const partiallyFilledPriceOrders: string[] = [];
        let partialFilledPrice;
        const asks = globalState.orderBooks[orderData.market].asks;
        let orderQty = orderData.qty;

        // two scenero can happen either full filled or partial filled.

        while (!asksHeap.isEmpty() && asksHeap.peek()! <= orderData.price) {
          if (orderQty === 0) {
            break;
          }
          const price = asksHeap.peek()!;
          const askPriceBid = asks[price]!;

          if (askPriceBid.availableQty <= orderQty) {
            fullPriceToBeDeleted.push(price);
            orderQty -= askPriceBid.availableQty;
            asksHeap.pop();
          } else {
            for (const order of askPriceBid.openOrders) {
              partiallyFilledPriceOrders.push(order.orderId);
              if (orderQty <= order.qty - order.filledQty) {
                orderQty = 0;
                order.filledQty += orderQty;
              } else {
                orderQty -= order.qty - order.filledQty;
                order.filledQty = order.qty;
              }
            }
            partialFilledPrice = price;
          }
        }

        // handle the full price
        fullPriceToBeDeleted.forEach((fullPrice) => {
          asks[fullPrice]?.openOrders.forEach((order) => {
            globalState.fills.push({
              taker: userFound.userId,
              long: userFound.userId,
              maker: order.userId,
              market: orderData.market,
              price: fullPrice,
              short: order.userId,
              qty: order.qty - order.filledQty,
            });
            // update the user order which is the taker
            globalState.users
              .find((user) => user.userId === order.userId)!
              .orders.find((ord) => ord.orderId === order.orderId)!.status =
              "filled";

            // add to positions of the user who is buying
            globalState.addToUserPostion(
              orderData.market,
              "LONG",
              order.qty - order.filledQty,
              orderData.equity,
              userFound.userId,
              fullPrice,
            );
            // add to positions of the user who is selling
            globalState.addToUserPostion(
              orderData.market,
              "SHORT",
              order.qty - order.filledQty,
              orderData.equity,
              order.userId,
              fullPrice,
            );
            //
          });
        });

        // handle the partial price
        if (partialFilledPrice) {
          for (const order of asks![partialFilledPrice]!.openOrders) {
            if (order.filledQty === order.qty) {
              globalState.fills.push({
                taker: userFound.userId,
                long: userFound.userId,
                maker: order.userId,
                market: orderData.market,
                price: partialFilledPrice,
                short: order.userId,
                qty: order.qty - order.filledQty,
              });
              // update the user order which is the taker
              globalState.users
                .find((user) => user.userId === order.userId)!
                .orders.find((ord) => ord.orderId === order.orderId)!.status =
                "filled";

              // add to positions of the user who is buying
              globalState.addToUserPostion(
                orderData.market,
                "LONG",
                order.qty - order.filledQty,
                orderData.equity,
                userFound.userId,
                partialFilledPrice,
              );
              // add to positions of the user who is selling
              globalState.addToUserPostion(
                orderData.market,
                "SHORT",
                order.qty - order.filledQty,
                orderData.equity,
                order.userId,
                partialFilledPrice,
              );
            } else {
              globalState.fills.push({
                taker: userFound.userId,
                long: userFound.userId,
                maker: order.userId,
                market: orderData.market,
                price: partialFilledPrice,
                short: order.userId,
                qty: order.qty - order.filledQty,
              });
            }
          }
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
