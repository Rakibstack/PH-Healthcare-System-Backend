/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { appointmentService } from "./appointment.service";


const bookAppointment = catchAsync(async (req: Request,res: Response) => {

    const result = await appointmentService.bookAppointment();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Appointment booked successfully",
        data: result,
    });
});     
export const appointmentController = {
    bookAppointment
}