/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpstatus from "http-status";
import { userService } from "./user.service";

const updateUserProfile = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new Error("File Not Found");
  }
  const userId = req.user?.userId as string
  const result = await userService.updateUserProfile(req.file?.buffer,userId);
  sendResponse(res, {
    success: true,
    statusCode: httpstatus.OK,
    message: "User Profile Update Successfully",
    data: result,
  });
});

export const userController = {
  updateUserProfile,
};
