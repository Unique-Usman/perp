import type { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";

const notFound = (req: Request, res: Response, next: NextFunction) => {
  return next(new AppError("Route NotFound", 404));
};

export default notFound;
