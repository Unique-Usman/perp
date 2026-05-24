import type { NextFunction, Request, Response } from "express";
import globalState from "../state";
import { AppError } from "../middleware/errorHandler";

const getAvailableEquity = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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
};

export default getAvailableEquity;
