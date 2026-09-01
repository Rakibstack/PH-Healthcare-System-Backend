/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import z from "zod";

export const validationRequest = (zodSchema: z.ZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body ?? {};

    const result = zodSchema.safeParse(payload);
    if (!result.success) {
      throw new Error(result.error.issues[0].message);
    }

    req.body = result.data

    next()
  });
};
