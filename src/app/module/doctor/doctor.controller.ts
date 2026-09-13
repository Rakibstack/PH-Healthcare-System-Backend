/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { doctorService } from "./doctor.service";

const applyAsDoctor = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const resume = files["resume"]?.[0] || null;
    const additionalFile = files["additionalFile"] || [];

    const payload =JSON.parse(req.body.data)

    const result = await doctorService.applyAsDoctor(
      payload.data,
      resume,
      additionalFile,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Patient registered successfully",
      data: result,
    });
  },
);
const verifyDoctorEmail = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const result = await doctorService.verifyDoctorEmail(payload);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Verify Doctor Email successfully",
      data: result,
    });
  },
);
const approveDoctor = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const user  = req.user!
    const result = await doctorService.approveDoctor(payload,user);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Approve Doctor successfully",
      data: result,
    });
  },
);
const getAllDoctor = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    
    const result = await doctorService.getAllDoctor()

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Retrieved Doctors successfully",
      data: result,
    });
  },
);



export const doctorController = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctor
};
