/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import {
  addDays,
  differenceInMinutes,
  isAfter,
  isSameDay,
  startOfDay,
} from "date-fns";
import { prisma } from "../../lib/prisma";
import { requestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { ICreateSchedulePayload, IUpdateSchedulePayload } from "./schedule.interface";
import httpStatus from "http-status";
import { IQuery } from "../../interface";
import { ScheduleWhereInput } from "../../../generated/prisma/models";
import { ScheduleStatus } from "../../../generated/prisma/enums";

const createSchedule = async (
  payload: ICreateSchedulePayload,
  user: requestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  // 25 August => start Time  : 9:00 PM
  // 26 August => end Time : 3:00AM

  if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time And End Date Time Must Be On The Same Day",
    );
  }
  if (isAfter(payload.startDateTime, payload.endDateTime)) {
    // 25 August =>  3:00 PM - 9:00 PM

    throw new AppError(
      httpStatus.CONFLICT,
      "Start Date Time Cannot Be After End Date Time",
    );
  }

  //startDateTime = 2026-08-25T13:30:00.436Z => 1:30 PM
  const startOfTheDay = startOfDay(payload.startDateTime); // 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z
  const startOfNextDay = addDays(startOfTheDay, 1); // 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

  const existingScheduleOnThisDate = await prisma.schedule.findFirst({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      startDateTime: {
        gte: startOfTheDay,
        lt: startOfNextDay,
      },
    },
  });

  if (existingScheduleOnThisDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You Already Have A Schedule For This Date",
    );
  }

  const durationInMinutes = differenceInMinutes(
    payload.startDateTime,
    payload.endDateTime,
  );

  const MINUTES_ALLOCATED_PER_SLOT = 20;

  const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

  if (totalSlots < 1) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long To Fit One Slot`,
    );
  }

  const schedule = await prisma.schedule.create({
    data: {
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      meetingLink: payload.meetingLink,
      totalSlots,
      availableSlots: totalSlots,
      doctorId: doctor.id,
    },
    include: {
      doctor: {
        select: {
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return schedule;
};

const getMySchedules = async (query: IQuery, user: requestUser) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  // let limit = 10;
  // if (query.limit) {
  //     limit = Number(query.limit);
  // }

  // let page = 1;
  // if (query.page) {
  //     page = Number(query.page);
  // }

  // const skip = (page - 1) * limit;

  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const andConditions: ScheduleWhereInput[] = [
    {
      doctorId: doctor.id,
    },
    {
      isDeleted: false,
    },
  ];

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip,
    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },
    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
const getAllSchedules = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ScheduleWhereInput[] = [];

  if (query.doctorId) {
    andConditions.push({ doctorId: query.doctorId });
  }
  if (query.email) {
    andConditions.push({
      doctor: {
        email: query.email,
      },
    });
  }

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  if (query.searchTerm) {
    andConditions.push({
      doctor: {
        OR: [
          { name: { contains: query.searchTerm, mode: "insensitive" } },
          { email: { contains: query.searchTerm, mode: "insensitive" } },
          {
            specialization: { contains: query.searchTerm, mode: "insensitive" },
          },
        ],
      },
    });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip,
    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },
    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getScheduleById = async (scheduleId : string) => {

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
            doctor: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    specialization: true,
                    userId: true,
                },
            },
            appointments: {
                include: {
                    patient: true
                },
            }
        },
    });

    if(!schedule || schedule.isDeleted){
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    return schedule

}
const updateSchedule = async (
  scheduleId: string,
  payload: IUpdateSchedulePayload,
  user: requestUser,
) => {
  // 1. Find doctor profile
  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!doctor) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Doctor profile not found",
    );
  }

  // 2. Find schedule owned by this doctor
  const schedule = await prisma.schedule.findUnique({
    where: {
      id: scheduleId,
      doctorId: doctor.id,
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Schedule not found",
    );
  }

  // 3. Check whether any appointment has been booked
  const hasBookedAppointment =
    schedule.totalSlots !== schedule.availableSlots;

  // 4. Published schedule + booked appointment
  //    → start/end time cannot be changed
  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    hasBookedAppointment &&
    (payload.startDateTime || payload.endDateTime)
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Once an appointment is booked, the schedule time cannot be updated",
    );
  }

  // 5. Prepare updated values without mutating payload
  const startDateTime =
    payload.startDateTime ?? schedule.startDateTime;

  const endDateTime =
    payload.endDateTime ?? schedule.endDateTime;

  const meetingLink =
    payload.meetingLink ?? schedule.meetingLink;

  // 6. Published schedule date is locked
  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    !isSameDay(startDateTime, schedule.startDateTime)
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Published schedule date cannot be changed",
    );
  }

  // 7. Start/end must be on the same day
  if (!isSameDay(startDateTime, endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start date and end date must be on the same day",
    );
  }

  // 8. Start time cannot be after end time
  if (isAfter(startDateTime, endDateTime)) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Start date and time cannot be after end date and time",
    );
  }

  // 9. Calculate duration
  const durationInMinutes = differenceInMinutes(
    endDateTime,
    startDateTime,
  );

  const MIN_SCHEDULE_MINUTES = 3 * 60;
  const MAX_SCHEDULE_MINUTES = 8 * 60;
  const MINUTES_PER_SLOT = 20;

  // 10. Schedule must be 3–8 hours
  if (durationInMinutes < MIN_SCHEDULE_MINUTES) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Schedule must be at least 3 hours long",
    );
  }

  if (durationInMinutes > MAX_SCHEDULE_MINUTES) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Schedule cannot be longer than 8 hours",
    );
  }

  // 11. Calculate total slots
  const totalSlots = Math.floor(
    durationInMinutes / MINUTES_PER_SLOT,
  );

  // 12. Check another schedule on the same date
  const startOfTheDay = startOfDay(startDateTime);
  const startOfNextDay = addDays(startOfTheDay, 1);

  const existingScheduleOnThisDate =
    await prisma.schedule.findFirst({
      where: {
        doctorId: doctor.id,
        isDeleted: false,

        id: {
          not: schedule.id,
        },

        startDateTime: {
          gte: startOfTheDay,
          lt: startOfNextDay,
        },
      },
    });

  if (existingScheduleOnThisDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a schedule for this date",
    );
  }

  // 13. Update schedule
  const updatedSchedule = await prisma.schedule.update({
    where: {
      id: schedule.id,
    },
    data: {
      startDateTime,
      endDateTime,
      meetingLink,
      totalSlots,
      availableSlots: totalSlots,

      doctorId: doctor.id,
    },
    include: {
      doctor: {
        select: { 
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return updatedSchedule;
};
const publishSchedule = async (scheduleId : string, user : requestUser) => {
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId, doctorId : doctor.id },
    });

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status === ScheduleStatus.PUBLISHED) {
        throw new AppError(httpStatus.CONFLICT, "Schedule Is Already Published");
    }

    const publishedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: { status: ScheduleStatus.PUBLISHED },
    });

    return publishedSchedule;
}

const deleteSchedule = async (scheduleId: string, user: requestUser) => {
    const doctor = await prisma.doctor.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId, doctorId: doctor.id },
    });

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots) {
        throw new AppError(httpStatus.CONFLICT, "Schedule Once Published And Appoinement Booked Cannot Be Deleted");
    };

    const deletedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: { isDeleted: true, deletedAt: new Date() },
    });

    return deletedSchedule;
}


export const scheduleService = {
  createSchedule,
  getMySchedules,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  publishSchedule
};
