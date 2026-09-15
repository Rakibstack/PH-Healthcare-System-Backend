/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { addDays, differenceInMinutes, isAfter, isSameDay, startOfDay } from "date-fns";
import { prisma } from "../../lib/prisma";
import { requestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { ICreateSchedulePayload } from "./schedule.interface";
import httpStatus from 'http-status'



const createSchedule = async (payload : ICreateSchedulePayload , user : requestUser) => {

    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    // 25 August => start Time  : 9:00 PM 
    // 26 August => end Time : 3:00AM

    if(!isSameDay(payload.startDateTime, payload.endDateTime)){ 
        throw new AppError(httpStatus.CONFLICT, "Start Date Time And End Date Time Must Be On The Same Day")
    }
    if(isAfter(payload.startDateTime, payload.endDateTime)){ // 25 August =>  3:00 PM - 9:00 PM

        throw new AppError(httpStatus.CONFLICT, "Start Date Time Cannot Be After End Date Time")
    }


    //startDateTime = 2026-08-25T13:30:00.436Z => 1:30 PM
    const startOfTheDay = startOfDay(payload.startDateTime) // 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z
    const startOfNextDay = addDays(startOfTheDay, 1)  // 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

    const existingScheduleOnThisDate = await prisma.schedule.findFirst({
        where : {
            doctorId : doctor.id,
            isDeleted : false,
            startDateTime : {
                gte : startOfTheDay,
                lt : startOfNextDay
            }
        }
    })

    if(existingScheduleOnThisDate) {
        throw new AppError(
            httpStatus.CONFLICT,
            "You Already Have A Schedule For This Date",
        );
    }


    const durationInMinutes = differenceInMinutes(
        payload.startDateTime,
        payload.endDateTime
    )

    const MINUTES_ALLOCATED_PER_SLOT = 20

    const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT)

    if (totalSlots < 1) {
        throw new AppError(
            httpStatus.CONFLICT,
            `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long To Fit One Slot`,
        );
    }

    const schedule = await prisma.schedule.create({
        data : {
            startDateTime : payload.startDateTime,
            endDateTime : payload.endDateTime,
            meetingLink : payload.meetingLink,
            totalSlots,
            availableSlots : totalSlots,
            doctorId : doctor.id
        },
        include : {
            doctor : {
                select : {
                    name : true,
                    email : true,
                    contactNumber : true
                }
            }
        }
    })

    return schedule
}


export const scheduleService = {
    createSchedule
}