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

    if (token !== ADMIN_SECRET) {
      throw new Error("ADMIN_SECRET is invalid");
    }

    next();
  } catch (err) {
    return next(new AppError("Invalid Token", 401));
  }
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const userId = (req as Request & { user: string }).user;

  return matchingEngine(res, next, userId, orderData);
});

app.delete("/order", authMiddleWare, (req, res) => {});
app.get("/equity/available", authMiddleWare, (req, res) => {});
app.get("/positions/open/:marketId", authMiddleWare, (req, res) => {});
app.get("/positions/closed/:marketId", authMiddleWare, (req, res) => {});
app.get("/orders/open/:marketId", authMiddleWare, (req, res) => {});
app.get("/orders/:marketId", authMiddleWare, (req, res) => {});
app.get("/fills", authMiddleWare, (req, res) => {});

app.use(notFound);
app.use(errorHandler);
onPriceUpdateFromBinance();

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
