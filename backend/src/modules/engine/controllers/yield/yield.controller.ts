import { Request, Response } from "express";
import { logger } from "@common";

export const getBTCYield = (req: Request, res: Response) => {
  res.json({ message: "//api running" });
  logger.info("Yield API accessed");
};
