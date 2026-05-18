import express from "express";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import z from "zod";
import bcyrpt from "bcrypt";
import type { Fills, Orderbooks, User, Users } from "./types";
import errorHandler from "./errorHandler";
import { AppError } from "./errorHandler";
import notFound from "./notFound";

const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());

const UserSignUpInSchema = z.object({
  username: z.string().min(6),
  password: z.string().min(6),
});

const users: Users = [
  {
    userId: "1",
    username: "harkirat",
    password: "123123",
    collateral: {
      available: 2000,
      locked: 1000,
    },
    positions: [
      {
        market: "SOL",
        type: "LONG",
        qty: 10,
        margin: 500,
        liquidationPrice: 80,
        pnL: 0,
        averagePrice: 90,
      },
      {
        market: "ETH",
        type: "SHORT",
        qty: 1,
        margin: 500,
        liquidationPrice: 2000,
        pnL: 0,
        averagePrice: 1900,
      },
    ],
    orders: [
      {
        orderId: "1",
        market: "SOL",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 90,
        status: "filled",
      },
      {
        orderId: "2",
        market: "ETH",
        type: "SHORT",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "filled",
      },
      {
        orderId: "3",
        market: "BTC",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "cancelled",
      },
    ],
  },
  {
    userId: "2",
    username: "raman",
    password: "123123",
    collateral: {
      available: 2000,
      locked: 2000,
    },
    positions: [
      {
        market: "SOL",
        type: "SHORT",
        qty: 10,
        margin: 1000,
        liquidationPrice: 80,
        pnL: 200,
        averagePrice: 90,
      },
      {
        market: "ETH",
        type: "LONG",
        qty: 1,
        margin: 1000,
        liquidationPrice: 2000,
        pnL: -100,
        averagePrice: 1900,
      },
    ],
    orders: [
      {
        orderId: "10",
        market: "SOL",
        type: "SHORT",
        qty: 10,
        margin: 500,
        orderType: "market",
        price: 90,
        status: "filled",
      },
      {
        orderId: "11",
        market: "ETH",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "market",
        price: 1900,
        status: "filled",
      },
      {
        orderId: "12",
        market: "ZEC",
        type: "LONG",
        qty: 10,
        margin: 500,
        orderType: "limit",
        price: 1900,
        status: "open",
      },
    ],
  },
];

const orderbooks: Orderbooks = {
  SOL: { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01 },
  ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 },
};

const fills: Fills = [
  {
    maker: "1",
    taker: "2",
    market: "SOL",
    qty: 10,
    price: 90,
    long: "1",
    short: "2",
  },
  {
    maker: "1",
    taker: "2",
    market: "ETH",
    qty: 1,
    price: 1900,
    long: "2",
    short: "1",
  },
];

const authMiddleWare = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return next(new AppError("Authorization token missing", 401));
    }
    const token = authorization.split(" ")[1];

    if (!token) {
      return next(new AppError("Authorization token missing", 401));
    }

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is missing");
    }

    const decodedToken = jwt.verify(token, JWT_SECRET) as { userId: string };

    (req as Request & { user: string }).user = decodedToken.userId;

    next();
  } catch (err) {
    return next(new AppError("Invalid Token", 401));
  }
};

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "The server is up" });
});

app.post("/signup", async (req, res, next: NextFunction) => {
  const result = UserSignUpInSchema.safeParse(req.body);
  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }

  let foundUser = users.find((user) => user.username === result.data?.username);

  if (foundUser) {
    return next(new AppError("User already exists", 409));
  }

  const hashedPassword = await bcyrpt.hash(result.data.password, 10);

  const user: User = {
    userId: crypto.randomUUID(),
    username: result.data.username,
    password: hashedPassword,
    collateral: {
      available: 0,
      locked: 0,
    },

    positions: [],
    orders: [],
  };

  users.push(user);

  res.status(201).json({
    success: true,
    user: {
      id: user.userId,
      username: user.username,
    },
  });
});

app.post("/signin", async (req, res, next) => {
  const result = UserSignUpInSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Credentials", 401));
  }

  const user = users.find((user) => user.username === result.data.username);

  if (!user) {
    return next(new AppError("Invalid Credentials", 401));
  }

  const isCorrectPassword = await bcyrpt.compare(
    result.data.password,
    user.password,
  );

  if (!isCorrectPassword) {
    return next(new AppError("Invalid Credentials", 401));
  }

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  const token = jwt.sign({ userId: user.userId }, JWT_SECRET, {
    expiresIn: "10m",
  });

  res.status(200).json({
    success: true,
    token,
  });
});

app.post("/onramp", authMiddleWare, (req, res, next) => {
  const userId = (req as Request & { user: string }).user;
  const user = users.find((user) => user.userId === userId);

  if (!user) {
    return next(new AppError("Unauthroized", 401));
  }

  const amountToAdd = parseInt(req.body.amount);

  if (isNaN(amountToAdd) || !amountToAdd) {
    return next(new AppError("Invalid Request body", 400));
  }

  if (!amountToAdd) {
    return next(new AppError("Invalid request body, missing amount", 400));
  }

  user.collateral.available += amountToAdd;

  return res.status(200).json({
    success: true,
    collateral: user.collateral,
  });
});

// price: 91.24
//
//     qty: 90,
//
//     equity: 550.17,
//
//      type: “LONG”,
//
//      market: “SOL”

const OrderSchema = z.object({
  price: z.number(),
  qty: z.number(),
  equity: z.number(),
  type: z.enum(["LONG", "SHORT"]),
  market: z.enum(["SOL", "ETH", "BTC", "PRICE"]),
  orderType: z.enum(["market", "limit"]),
});

// Need lot of work
app.post("/order", authMiddleWare, (req, res, next) => {
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const leverage = (orderData.qty * orderData.price) / orderData.equity;

  if (orderData.orderType === "market") {
  } else {
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
