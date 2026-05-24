import type { Request, Response, NextFunction } from "express";
import globalState from "../state";
import { AppError } from "../middleware/errorHandler";

const fills = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as Request & { user: string }).user;
  const user = globalState.users.find((user) => user.userId === userId);
  if (!user) {
    return next(new AppError("User Not Found", 404));
  }

  const fillsForTheUser = globalState.fills.filter(
    (fill) => fill.taker === userId || fill.maker === userId,
  );

  res.status(200).json(fillsForTheUser);
};

export default fills;
