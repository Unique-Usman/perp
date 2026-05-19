import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import globalState from "../state";

const onramp = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);

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
};

export default onramp;
