import type { Response, Request, NextFunction } from "express";
import globalState from "../state";
import { AppError } from "../middleware/errorHandler";

const positionsClosedMarketId = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const marketId = req.params.marketId;
  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }

  res
    .status(200)
    .json(
      user.closedPositions.filter((position) => position.market === marketId),
    );
};

export default positionsClosedMarketId;
