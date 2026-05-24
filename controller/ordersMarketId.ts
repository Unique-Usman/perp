import type { Response, Request, NextFunction } from "express";
import globalState from "../state";
import { AppError } from "../middleware/errorHandler";

const ordersMarketId = (req: Request, res: Response, next: NextFunction) => {
  const marketId = req.params.marketId;

  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }
  const orders = user.orders.filter((order) => order.market === marketId);
  return res.status(200).json(orders);
};

export default ordersMarketId;
