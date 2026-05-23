import { AppError } from "./middleware/errorHandler";
import globalState from "./state";
import type { NextFunction, Response } from "express";
import type { Order } from "./types";

const matchingEngine = (
  res: Response,
  next: NextFunction,
  userId: string,
  orderData: {
    price: number; // for market type let the use send arbitary price
    qty: number;
    equity: number;
    type: "LONG" | "SHORT";
    market: "SOL" | "ETH" | "BTC";
    orderType: "market" | "limit" | "liquidation";
  },
) => {
  const userFound = globalState.users.find((user) => user.userId === userId);

  if (!userFound) {
    return next(new AppError("Unauthorized User", 401));
  }

  if (
    orderData.orderType === "market" ||
    orderData.orderType === "liquidation"
  ) {
    // if is market order, there is no need to have another logic, just append the minimum price for sale and the maximum price for buy, this is obviously not the most ideal way though
    // update this to current price in of the orderData.market price if this is the first order;
    if (orderData.type === "SHORT") {
      const sortedBuy = globalState.orderBooks[orderData.market].bidsHeap
        .toArray()
        .sort((a, b) => a - b);
      orderData.price = sortedBuy[0]!;
      if (!orderData.price) {
        orderData.price = globalState.orderBooks[orderData.market].markPrice;
      }
    } else {
      const sortedAsk = globalState.orderBooks[orderData.market].asksHeap
        .toArray()
        .sort((a, b) => b - a);
      orderData.price = sortedAsk[0]!;

      if (!orderData.price) {
        orderData.price = globalState.orderBooks[orderData.market].markPrice;
      }
    }
  }

  // Checking if the users has the balance
  if (orderData.equity > userFound.collateral.available) {
    return next(new AppError("Insufficient funds", 409));
  }
  // locking the equity from the collateral
  userFound.collateral.available -= orderData.equity;
  userFound.collateral.locked += orderData.equity;

  if (orderData.type === "LONG") {
    // check if there is a match or not through the minHeap of the asksHeap
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
        globalState.orderBooks[order.market].bidsHeap.push(Number(order.price));
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
      // this is storing the userId's
      const partiallyFilledPriceOrders: Record<string, number> = {};
      let partialFilledPrice;
      const asks = globalState.orderBooks[orderData.market].asks;
      let orderQty = orderData.qty;

      // two scenero can happen either full filled or partial filled can happened together or paritially

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
            if (orderQty === 0) break;
            let quantityFilled;
            if (orderQty <= order.qty - order.filledQty) {
              order.filledQty += orderQty;
              quantityFilled = orderQty;
              orderQty = 0;
            } else {
              orderQty -= order.qty - order.filledQty;
              quantityFilled = order.qty - order.filledQty;
              order.filledQty = order.qty;
            }
            partiallyFilledPriceOrders[order.orderId] = quantityFilled;
          }
          partialFilledPrice = price;
        }
      }

      // handle the full price
      fullPriceToBeDeleted.forEach((fullPrice) => {
        asks[fullPrice]?.openOrders.forEach((order) => {
          const sellerUser = globalState.users.find(
            (user) => user.userId === order.userId,
          )!;
          const sellerOrder = sellerUser.orders.find(
            (ord) => ord.orderId === order.orderId,
          )!;

          globalState.fills.push({
            taker: userFound.userId,
            long: userFound.userId,
            maker: order.userId,
            market: orderData.market,
            price: fullPrice,
            short: order.userId,
            qty: order.qty - order.filledQty,
          });
          // update the user order which is the maker

          sellerOrder.status = "filled";
          const sellerMargin = sellerOrder.margin;
          const sellerQty = sellerOrder.qty;
          // add to positions of the user who is buying
          globalState.addToUserPostion(
            orderData.market,
            "LONG",
            sellerQty!,
            (order.qty! / orderData.qty) * orderData.equity,
            userFound.userId,
            fullPrice,
          );
          // add to positions of the user who is selling
          globalState.addToUserPostion(
            orderData.market,
            "SHORT",
            sellerQty!,
            sellerMargin!,
            order.userId,
            fullPrice,
          );
          //
        });

        delete asks[fullPrice];
      });

      // handle the partial price long
      if (partialFilledPrice) {
        for (const order of asks![partialFilledPrice]!.openOrders) {
          const sellerUser = globalState.users.find(
            (user) => user.userId === order.userId,
          )!;
          const sellerOrder = sellerUser.orders.find(
            (ord) => ord.orderId === order.orderId,
          )!;
          if (partiallyFilledPriceOrders[order.orderId] === undefined) continue;
          if (order.filledQty === order.qty) {
            globalState.fills.push({
              taker: userFound.userId,
              long: userFound.userId,
              maker: order.userId,
              market: orderData.market,
              price: partialFilledPrice,
              short: order.userId,
              qty: partiallyFilledPriceOrders[order.orderId]!,
            });
            // update the user order which is the maker
            sellerOrder.status = "filled";

            // add to positions of the user who is buying
            globalState.addToUserPostion(
              orderData.market,
              "LONG",
              partiallyFilledPriceOrders[order.orderId]!,
              (partiallyFilledPriceOrders[order.orderId]! / orderData.qty) *
                orderData.equity,
              userFound.userId,
              partialFilledPrice,
            );
            // add to positions of the user who is selling
            globalState.addToUserPostion(
              orderData.market,
              "SHORT",
              partiallyFilledPriceOrders[order.orderId]!,
              sellerOrder.margin,
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
              qty: partiallyFilledPriceOrders[order.orderId]!,
            });

            // update the user order which is the maker
            sellerOrder.status = "partially_filled";

            const sellerMargin = sellerOrder.margin;
            // add to positions of the user who is buying
            globalState.addToUserPostion(
              orderData.market,
              "LONG",
              partiallyFilledPriceOrders[order.orderId]!,
              (partiallyFilledPriceOrders[order.orderId]! / orderData.qty) *
                orderData.equity,
              userFound.userId,
              partialFilledPrice,
            );
            // add to positions of the user who is selling
            globalState.addToUserPostion(
              orderData.market,
              "SHORT",
              partiallyFilledPriceOrders[order.orderId]!,
              sellerMargin!,
              order.userId,
              partialFilledPrice,
            );
          }

          asks[partialFilledPrice]!.availableQty -=
            partiallyFilledPriceOrders[order.orderId]!;
        }
        asks[partialFilledPrice]!.openOrders = asks[
          partialFilledPrice
        ]!.openOrders.filter((ord) => ord.filledQty < ord.qty);
      }

      // register the order in the user order;
      let order: Order;

      if (orderQty === 0) {
        order = {
          orderId: crypto.randomUUID(),
          market: orderData.market,
          type: orderData.type,
          qty: orderData.qty,
          margin: orderData.equity,
          orderType: orderData.orderType,
          price: orderData.price,
          status: "filled",
        };
      } else {
        order = {
          orderId: crypto.randomUUID(),
          market: orderData.market,
          type: orderData.type,
          qty: orderData.qty,
          margin: orderData.equity,
          orderType: orderData.orderType,
          price: orderData.price,
          status: "partially_filled",
        };
        // order should be added to the orderbook and the price to the bidsHeap if not present
        const bidsOrders =
          globalState.orderBooks[order.market]?.bids[order.price];
        const filledQty = orderData.qty - orderQty;
        const unfilledQty = orderQty;

        if (bidsOrders) {
          bidsOrders.availableQty = (bidsOrders.availableQty ?? 0) + orderQty;
          bidsOrders.openOrders.push({
            userId,
            qty: order.qty,
            filledQty: filledQty,
            orderId: order.orderId,
            createdAt: new Date(),
          });
        } else {
          // no order in the orderbook for the same price
          globalState.orderBooks[order.market].bidsHeap.push(
            Number(order.price),
          );
          globalState.orderBooks[order.market].bids[order.price] = {
            availableQty: unfilledQty,
            openOrders: [
              {
                userId,
                qty: order.qty,
                filledQty: filledQty,
                orderId: order.orderId,
                createdAt: new Date(),
              },
            ],
          };
        }
      }
      userFound.orders.push(order);
      return res.status(201).json(order);
    }
  } else {
    // check if there is a match or not through the maxHeap of the bidsHeap.
    const bidsHeap = globalState.orderBooks[orderData.market].bidsHeap;

    const isPriceAbsent =
      bidsHeap.isEmpty() || bidsHeap.peek()! < orderData.price;

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

      // order should be added to the orderbook and the price to the asksHeap if not present
      const asksOrders =
        globalState.orderBooks[order.market]?.asks[order.price];

      if (asksOrders) {
        asksOrders.availableQty = (asksOrders.availableQty ?? 0) + order.qty;
        asksOrders.openOrders.push({
          userId,
          qty: order.qty,
          filledQty: 0,
          orderId: order.orderId,
          createdAt: new Date(),
        });
      } else {
        // no order in the orderbook for the same price
        globalState.orderBooks[order.market].asksHeap.push(Number(order.price));
        globalState.orderBooks[order.market].asks[order.price] = {
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
      // this is storing the userId's
      const partiallyFilledPriceOrders: Record<string, number> = {};
      let partialFilledPrice;
      const bids = globalState.orderBooks[orderData.market].bids;
      let orderQty = orderData.qty;

      while (!bidsHeap.isEmpty() && bidsHeap.peek()! >= orderData.price) {
        if (orderQty === 0) {
          break;
        }
        const price = bidsHeap.peek()!;
        const bidPriceBid = bids[price]!;

        if (bidPriceBid.availableQty <= orderQty) {
          fullPriceToBeDeleted.push(price);
          orderQty -= bidPriceBid.availableQty;
          bidsHeap.pop();
        } else {
          for (const order of bidPriceBid.openOrders) {
            if (orderQty === 0) break;
            let quantityFilled;
            if (orderQty <= order.qty - order.filledQty) {
              order.filledQty += orderQty;
              quantityFilled = orderQty;
              orderQty = 0;
            } else {
              orderQty -= order.qty - order.filledQty;
              quantityFilled = order.qty - order.filledQty;
              order.filledQty = order.qty;
            }
            partiallyFilledPriceOrders[order.orderId] = quantityFilled;
          }
          partialFilledPrice = price;
        }
      }
      // handle the full price
      fullPriceToBeDeleted.forEach((fullPrice) => {
        bids[fullPrice]?.openOrders.forEach((order) => {
          const buyerUser = globalState.users.find(
            (user) => user.userId === order.userId,
          )!;
          const buyerOrder = buyerUser.orders.find(
            (ord) => ord.orderId === order.orderId,
          )!;

          globalState.fills.push({
            taker: userFound.userId,
            short: userFound.userId,
            maker: order.userId,
            market: orderData.market,
            price: fullPrice,
            long: order.userId,
            qty: order.qty - order.filledQty,
          });
          // update the user order which is the maker

          buyerOrder.status = "filled";
          const buyerMargin = buyerOrder.margin;
          const buyerQty = buyerOrder.qty;
          // add to positions of the user who is buying
          globalState.addToUserPostion(
            orderData.market,
            "LONG",
            buyerQty!,
            buyerMargin!,
            order.userId,
            fullPrice,
          );

          // add to positions of the user who is selling
          globalState.addToUserPostion(
            orderData.market,
            "SHORT",
            buyerQty!,
            (buyerQty! / orderData.qty) * orderData.equity,
            userFound.userId,
            fullPrice,
          );
        });

        delete bids[fullPrice];
      });

      // handle the partial price for short
      if (partialFilledPrice) {
        for (const order of bids![partialFilledPrice]!.openOrders) {
          const buyerUser = globalState.users.find(
            (user) => user.userId === order.userId,
          )!;
          const buyerOrder = buyerUser.orders.find(
            (ord) => ord.orderId === order.orderId,
          )!;
          if (partiallyFilledPriceOrders[order.orderId] === undefined) continue;
          if (order.filledQty === order.qty) {
            globalState.fills.push({
              taker: userFound.userId,
              short: userFound.userId,
              maker: order.userId,
              market: orderData.market,
              price: partialFilledPrice,
              long: order.userId,
              qty: partiallyFilledPriceOrders[order.orderId]!,
            });

            // update the user order which is the maker
            buyerOrder.status = "filled";

            // add to positions of the user who is buying
            globalState.addToUserPostion(
              orderData.market,
              "LONG",
              partiallyFilledPriceOrders[order.orderId]!,
              buyerOrder.margin,
              order.userId,
              partialFilledPrice,
            );
            // add to positions of the user who is selling
            globalState.addToUserPostion(
              orderData.market,
              "SHORT",
              partiallyFilledPriceOrders[order.orderId]!,
              (partiallyFilledPriceOrders[order.orderId]! / orderData.qty) *
                orderData.equity,
              userFound.userId,
              partialFilledPrice,
            );
          } else {
            globalState.fills.push({
              taker: userFound.userId,
              short: userFound.userId,
              maker: order.userId,
              market: orderData.market,
              price: partialFilledPrice,
              long: order.userId,
              qty: partiallyFilledPriceOrders[order.orderId]!,
            });

            // update the user order which is the maker
            buyerOrder.status = "partially_filled";

            const buyerMargin = buyerOrder.margin;
            // add to positions of the user who is buying
            globalState.addToUserPostion(
              orderData.market,
              "LONG",
              partiallyFilledPriceOrders[order.orderId]!,
              buyerMargin,
              order.userId,
              partialFilledPrice,
            );
            // add to positions of the user who is selling
            globalState.addToUserPostion(
              orderData.market,
              "SHORT",
              partiallyFilledPriceOrders[order.orderId]!,
              (partiallyFilledPriceOrders[order.orderId]! / orderData.qty) *
                orderData.equity,
              userFound.userId,
              partialFilledPrice,
            );
          }

          bids[partialFilledPrice]!.availableQty -=
            partiallyFilledPriceOrders[order.orderId]!;
        }
        bids[partialFilledPrice]!.openOrders = bids[
          partialFilledPrice
        ]!.openOrders.filter((ord) => ord.filledQty < ord.qty);
      }

      // register the order in the user order;
      let order: Order;

      if (orderQty === 0) {
        order = {
          orderId: crypto.randomUUID(),
          market: orderData.market,
          type: orderData.type,
          qty: orderData.qty,
          margin: orderData.equity,
          orderType: orderData.orderType,
          price: orderData.price,
          status: "filled",
        };
      } else {
        order = {
          orderId: crypto.randomUUID(),
          market: orderData.market,
          type: orderData.type,
          qty: orderData.qty,
          margin: orderData.equity,
          orderType: orderData.orderType,
          price: orderData.price,
          status: "partially_filled",
        };
        // order should be added to the orderbook and the price to the asksHeap if not present
        const asksOrders =
          globalState.orderBooks[order.market]?.asks[order.price];
        const filledQty = orderData.qty - orderQty;
        const unfilledQty = orderQty;

        if (asksOrders) {
          asksOrders.availableQty = (asksOrders.availableQty ?? 0) + orderQty;
          asksOrders.openOrders.push({
            userId,
            qty: order.qty,
            filledQty: filledQty,
            orderId: order.orderId,
            createdAt: new Date(),
          });
        } else {
          // no order in the orderbook for the same price
          globalState.orderBooks[order.market].asksHeap.push(
            Number(order.price),
          );
          globalState.orderBooks[order.market].asks[order.price] = {
            availableQty: unfilledQty,
            openOrders: [
              {
                userId,
                qty: order.qty,
                filledQty: filledQty,
                orderId: order.orderId,
                createdAt: new Date(),
              },
            ],
          };
        }
      }
      userFound.orders.push(order);
      return res.status(201).json(order);
    }
  }
};

export default matchingEngine;
