import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";


const bookAppointment = catchAsync(async (req: Request,res: Response) => {

})
export const appointmentController = {
    bookAppointment
}