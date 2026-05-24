import type { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/errorHandler";
import globalState from "../state";
import bcrypt from "bcrypt";
import type { User } from "../types";
import { UserSignUpInSchema } from "../zodSchema";

const signUp = async (req: Request, res: Response, next: NextFunction) => {
  const result = UserSignUpInSchema.safeParse(req.body);
  if (!result.success) {
    return next(new AppError("Invalid Request Body", 400, result.error.issues));
  }

  let foundUser = globalState.users.find(
    (user) => user.username === result.data?.username,
  );

  if (foundUser) {
    return next(new AppError("User already exists", 409));
  }

  const hashedPassword = await bcrypt.hash(result.data.password, 10);

  const user: User = {
    userId: crypto.randomUUID(),
    username: result.data.username,
    password: hashedPassword,
    collateral: {
      available: 0,
      locked: 0,
    },

    positions: [],
    closedPositions: [],
    orders: [],
  };

  globalState.users.push(user);

  res.status(201).json({
    success: true,
    user: {
      id: user.userId,
      username: user.username,
    },
  });
};

export default signUp;
