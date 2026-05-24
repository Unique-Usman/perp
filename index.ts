import express from "express";
import errorHandler from "./middleware/errorHandler";
import notFound from "./middleware/notFound";
import authMiddleWare from "./middleware/authMiddleware";
import signUp from "./controller/signUp";
import signIn from "./controller/signIn";
import onramp from "./controller/onramp";
import { onPriceUpdateFromBinance } from "./liquidation";
import liquidate from "./controller/liquidate";
import order from "./controller/order";
import deleteOrder from "./controller/deleteOrder";
import getAvailableEquity from "./controller/getAvailableEquity";
import fills from "./controller/fills";
import ordersMarketId from "./controller/ordersMarketId";
import ordersOpenMarketId from "./controller/ordersOpenMarketId";
import positionsClosedMarketId from "./controller/positionsClosedMarketId";
import positionsOpenMarketId from "./controller/positionsOpenMarketId";

const PORT = Number(process.env.PORT ?? 5000);
const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "The server is up" });
});
app.post("/signup", signUp);
app.post("/signin", signIn);
app.post("/onramp", authMiddleWare, onramp);
app.post("/order", authMiddleWare, order);
// This route is for the liquidation
app.post("/liquidate", liquidate);
app.delete("/order", authMiddleWare, deleteOrder);
app.get("/equity/available", authMiddleWare, getAvailableEquity);
app.get("/positions/open/:marketId", authMiddleWare, positionsOpenMarketId);
app.get("/positions/closed/:marketId", authMiddleWare, positionsClosedMarketId);
app.get("/orders/open/:marketId", authMiddleWare, ordersOpenMarketId);
// marketId => BTC, SOL, ETH
app.get("/orders/:marketId", authMiddleWare, ordersMarketId);
app.get("/fills", authMiddleWare, fills);

app.use(notFound);
app.use(errorHandler);
onPriceUpdateFromBinance();

app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
});
