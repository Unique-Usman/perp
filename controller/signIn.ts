import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import globalState from "../state";
import bcrypt from "bcrypt";
import { UserSignUpInSchema } from "../zodSchema";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

const signIn = async (req: Request, res: Response, next: NextFunction) => {
  const result = UserSignUpInSchema.safeParse(req.body);

  if (!result.success) {
    return next(new AppError("Invalid Credentials", 401));
  }

  const user = globalState.users.find(
    (user) => user.username === result.data.username,
  );

  if (!user) {
    return next(new AppError("Invalid Credentials", 401));
  }

  const isCorrectPassword = await bcrypt.compare(
    result.data.password,
    user.password,
  );

  if (!isCorrectPassword) {
    return next(new AppError("Invalid Credentials", 401));
  }

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  const token = jwt.sign({ userId: user.userId }, JWT_SECRET, {
    expiresIn: "10m",
  });

  res.status(200).json({
    success: true,
    token,
  });
};

export default signIn;
