import z from "zod";

export const UserSignUpInSchema = z.object({
  username: z.string().min(6),
  password: z.string().min(6),
});

export const OrderSchema = z.object({
  price: z.number(), // for market type let the use send arbitary price
  qty: z.number(),
  equity: z.number(),
  type: z.enum(["LONG", "SHORT"]),
  market: z.enum(["SOL", "ETH", "BTC"]),
  orderType: z.enum(["market", "limit"]),
  userId: z.string().optional(),
});

export const BinancePriceSchema = z.object({
  stream: z.enum([
    "solusdt@markPrice",
    "btcusdt@markPrice",
    "ethusdt@markPrice",
  ]),
  data: z.object({
    e: z.string(),
    E: z.number(),
    s: z.string(),
    p: z.string(),
    ap: z.string(),
    P: z.string(),
    i: z.string(),
    r: z.string(),
    T: z.number(),
  }),
});
