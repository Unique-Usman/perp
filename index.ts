import express from "express";
import type { Request } from "express";
import errorHandler, { AppError } from "./middleware/errorHandler";
import notFound from "./middleware/notFound";
import authMiddleWare from "./middleware/authMiddleware";
import signUp from "./controller/signUp";
import signIn from "./controller/signIn";
import onramp from "./controller/onramp";
import { OrderSchema } from "./zodSchema";
import matchingEngine from "./engine";
import { onPriceUpdateFromBinance } from "./liquidation";
import globalState from "./state";

const PORT = process.env.PORT;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "The server is up" });
});

app.post("/signup", signUp);
app.post("/signin", signIn);
app.post("/onramp", authMiddleWare, onramp);

app.post("/order", authMiddleWare, (req, res, next) => {
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const userId = (req as Request & { user: string }).user;

  return matchingEngine(res, next, userId, orderData);
});

// This route is for the liquidation
app.post("/liquidate", (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return next(new AppError("Authorization token missing", 401));
    }
    const token = authorization.split(" ")[1];

    if (!token) {
      return next(new AppError("Authorization token missing", 401));
    }

    if (!ADMIN_SECRET) {
      throw new Error("ADMIN_SECRET is missing");
    }

    if (!ADMIN_SECRET) {
      return next(
        new AppError(
          "Internal Server Error",
          500,
          "ADMIN_SECRET is not configured",
        ),
      );
    }
  } catch (err) {
    return next(new AppError("Invalid Token", 401));
  }
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const userId = orderData.userId;

  return matchingEngine(res, next, userId!, orderData);
});

app.delete("/order", authMiddleWare, (req, res, next) => {
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
});

app.get("/equity/available", authMiddleWare, (req, res, next) => {
  const userId = (req as Request & { user: string }).user;

  const user = globalState.users.find((user) => user.userId === userId);

  if (!user) {
    return next(new AppError("User Not Found", 404));
  }
  res.status(200).json({
    available: user?.collateral.available,
    locked: user?.collateral.locked,
    total: user?.collateral.locked + user?.collateral.available,
  });
});

app.get("/positions/open/:marketId", authMiddleWare, (req, res, next) => {
  const marketId = req.params.marketId;
  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }

  res.status(200).json(
    user.positions.filter((position) => position.market === marketId),
  );
});
app.get("/positions/closed/:marketId", authMiddleWare, (req, res, next) => {
  const marketId = req.params.marketId;
  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }

  res.status(200).json(
    user.closedPositions.filter((position) => position.market === marketId),
  );
});

app.get("/orders/open/:marketId", authMiddleWare, (req, res, next) => {
  const marketId = req.params.marketId;

  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }
  const orders = user.orders.filter(
    (order) => order.market === marketId && order.status === "open",
  );
  return res.status(200).json(orders);
});

// marketId => BTC, SOL, ETH
app.get("/orders/:marketId", authMiddleWare, (req, res, next) => {
  const marketId = req.params.marketId;

  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }
  const orders = user.orders.filter((order) => order.market === marketId);
  return res.status(200).json(orders);
});

app.get("/fills", authMiddleWare, (req, res, next) => {
  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }

  const fillsForTheUser = globalState.fills.find(
    (fill) => fill.taker === userId || fill.maker === userId,
  );

  res.status(200).json(fillsForTheUser);
});

app.use(notFound);
app.use(errorHandler);
onPriceUpdateFromBinance();

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
