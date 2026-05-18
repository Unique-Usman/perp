import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: unknown,
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ success: false, message: err.message, errors: err.errors });
  } else if (err instanceof Error) {
    res.status(500).json({ success: false, message: err.message });
  } else {
    res.status(500).json({ success: false, message: "Unknown error" });
  }
};

export default errorHandler;
