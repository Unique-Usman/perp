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
  market: z.enum(["SOL", "ETH", "BTC", "USD", "USDT"]),
  orderType: z.enum(["market", "limit"]),
});
