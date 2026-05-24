import type { Response, Request, NextFunction } from "express";
import { OrderSchema } from "../zodSchema";
import { AppError } from "../middleware/errorHandler";
import matchingEngine from "../engine";

const order = (req: Request, res: Response, next: NextFunction) => {
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const userId = (req as Request & { user: string }).user;

  return matchingEngine(res, next, userId, orderData);
};
export default order;
