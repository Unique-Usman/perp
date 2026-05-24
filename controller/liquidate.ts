import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import { OrderSchema } from "../zodSchema";
import matchingEngine from "../engine";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

const liquidate = (req: Request, res: Response, next: NextFunction) => {
  if (!ADMIN_SECRET) {
    return next(
      new AppError(
        "Internal Server Error",
        500,
        "ADMIN_SECRET is not configured",
      ),
    );
  }

  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return next(new AppError("Authorization token missing", 401));
    }
    const token = authorization.split(" ")[1];

    if (!token) {
      return next(new AppError("Authorization token missing", 401));
    }

    if (token !== ADMIN_SECRET) {
      return next(
        new AppError("Invalid Token", 401, "Admin token does not match"),
      );
    }
  } catch (err) {
    return next(new AppError("Invalid Token", 401));
  }
  const result = OrderSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }
  const orderData = result.data;
  const userId = orderData.userId;

  return matchingEngine(res, next, userId!, orderData);
};

export default liquidate;
