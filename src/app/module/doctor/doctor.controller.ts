/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { doctorService } from "./doctor.service";
import { applyAsDoctorZodSchema } from "./doctor.validation";

const applyAsDoctor = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const resume =files['resume']?.[0] || null;
    const additionalFile = files['additionalFile'] || [];

    const validationResult = applyAsDoctorZodSchema.safeParse(JSON.parse(req.body.data))
    if (!validationResult.success) {
        throw new Error(validationResult.error.issues[0].message)
    }
     
    const result = await doctorService.applyAsDoctor(validationResult.data, resume, additionalFile);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Patient registered successfully",
      data: result,
    });
  },
);

export const doctorController = {
  applyAsDoctor,
};
