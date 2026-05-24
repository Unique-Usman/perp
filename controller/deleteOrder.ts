import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import globalState from "../state";

const deleteOrder = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as Request & { user: string }).user;
  const orderId = req.body.orderId;

  if (!orderId) {
    return next(
      new AppError("Invalid Request Body", 400, "orderId is not presents"),
    );
  }

  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("Not Found", 404, "User not found"));
  }

  const orderInUser = user?.orders.find((ord) => ord.orderId === orderId)!;
  if (!orderInUser) {
    return next(new AppError("Not Found", 404, "Order not found"));
  }

  if (
    orderInUser?.status === "filled" ||
    orderInUser?.status === "cancelled" ||
    orderInUser?.status === "partially_filled_cancelled"
  ) {
    return next(
      new AppError(
        "Unprocessable Request",
        422,
        `The order is ${orderInUser.status}`,
      ),
    );
  }

  let orderBookAskOrBid;
  let orderBookAskOrBidHeap;

  if (orderInUser.type === "LONG") {
    orderBookAskOrBid = globalState.orderBooks[orderInUser.market].bids;
    orderBookAskOrBidHeap = globalState.orderBooks[orderInUser.market].bidsHeap;
  } else {
    orderBookAskOrBid = globalState.orderBooks[orderInUser.market].asks;
    orderBookAskOrBidHeap = globalState.orderBooks[orderInUser.market].asksHeap;
  }

  // Remove unfilled quantity from orderbook
  const orderIntheOrderBook = orderBookAskOrBid[
    orderInUser.price
  ]!.openOrders.find((ord) => ord.orderId === orderInUser.orderId);

  if (!orderIntheOrderBook) {
    return next(
      new AppError("Not Found", 404, "Order not found in order book"),
    );
  }

  orderBookAskOrBid[orderInUser.price]!.openOrders = orderBookAskOrBid[
    orderInUser.price
  ]!.openOrders.filter((ord) => ord.orderId !== orderInUser.orderId);

  orderBookAskOrBid[orderInUser.price]!.availableQty -=
    orderIntheOrderBook!.qty - orderIntheOrderBook!.filledQty;

  if (orderBookAskOrBid[orderInUser.price]!.availableQty <= 0) {
    delete orderBookAskOrBid[orderInUser.price];
    orderBookAskOrBidHeap.remove(orderInUser.price);
  }

  // filled the order in the user order and return the margin

  let realiseMargin = 0;

  if (orderInUser.status === "open") {
    orderInUser.status = "cancelled";
    realiseMargin = orderInUser.margin;
  } else if (orderInUser.status === "partially_filled") {
    orderInUser.status = "partially_filled_cancelled";
    realiseMargin =
      ((orderIntheOrderBook!.qty - orderIntheOrderBook!.filledQty) /
        orderInUser.qty) *
      orderInUser.margin;
  }
  user!.collateral.available += realiseMargin;
  user!.collateral.locked -= realiseMargin;

  res.status(200).json({
    orderId,
    status: orderInUser.status,
    filledQty: orderIntheOrderBook?.filledQty,
    cancelledQty: orderIntheOrderBook!.qty - orderIntheOrderBook!.filledQty,
    marginReleased: realiseMargin,
  });
};

export default deleteOrder;
