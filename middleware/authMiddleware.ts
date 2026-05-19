import type { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleWare = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization) {
      return next(new AppError("Authorization token missing", 401));
    }
    const token = authorization.split(" ")[1];

    if (!token) {
      return next(new AppError("Authorization token missing", 401));
    }

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is missing");
    }

    const decodedToken = jwt.verify(token, JWT_SECRET) as { userId: string };

    (req as Request & { user: string }).user = decodedToken.userId;

    next();
  } catch (err) {
    return next(new AppError("Invalid Token", 401));
  }
};

export default authMiddleWare;
