import httpStatus from "http-status";
import {
  AppointmentStatus,
  DoctorVerificationStatus,
  PaymentStatus,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { requestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";

const getAdminAnalytics = async () => {
  //total doctors

  const [
    totalDoctors,
    totalPendingDoctorApplications,
    totalApprovedDoctors,
    totalRejectedDoctors,
    totalPatients,
    totalAppointments,
    totalCompletedAppointments,
    totalCancelledAppointments,
    totalRefundResult,
    totalRevenueResult,
  ] = await Promise.all([
    prisma.doctor.count({
      where: {
        isDeleted: false,
      },
    }),

    prisma.doctor.count({
      where: {
        isDeleted: false,
        verificationStatus: DoctorVerificationStatus.PENDING,
      },
    }),

    prisma.doctor.count({
      where: {
        isDeleted: false,
        verificationStatus: DoctorVerificationStatus.VERIFIED,
      },
    }),

    prisma.doctor.count({
      where: {
        isDeleted: false,
        verificationStatus: DoctorVerificationStatus.REJECTED,
      },
    }),

    prisma.patient.count({
      where: {
        isDeleted: false,
      },
    }),

    prisma.apppointment.count(),

    prisma.apppointment.count({
      where: {
        status: AppointmentStatus.COMPLETED,
      },
    }),

    prisma.apppointment.count({
      where: {
        status: AppointmentStatus.CANCELLED,
      },
    }),

    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.REFUNDED,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.PAID,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);
  const totalRefunded = totalRefundResult._sum.amount?.toNumber() || 0;
  const totalRevenue =
    (totalRevenueResult._sum.amount?.toNumber() || 0) - totalRefunded;

  return {
    totalDoctors,
    totalPendingDoctorApplications,
    totalApprovedDoctors,
    totalRejectedDoctors,
    totalPatients,
    totalAppointments,
    totalCompletedAppointments,
    totalCancelledAppointments,
    totalRefunded,
    totalRevenue
  };
};
const getPatientAnalytics = async (user: requestUser) => {
  const patient = await prisma.patient.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!patient) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Patient Profile Not Found",
    );
  }

  const [
    totalAppointments,
    upcomingAppointments,
    completedAppointments,
    cancelledAppointments,
    totalAmountSpentResult,
    totalRefundedResult,
  ] = await Promise.all([
    prisma.apppointment.count({
      where: {
        patientId: patient.id,
      },
    }),

    prisma.apppointment.count({
      where: {
        patientId: patient.id,
        status: AppointmentStatus.CONFIRMED,
      },
    }),

    prisma.apppointment.count({
      where: {
        patientId: patient.id,
        status: AppointmentStatus.COMPLETED,
      },
    }),

    prisma.apppointment.count({
      where: {
        patientId: patient.id,
        status: AppointmentStatus.CANCELLED,
      },
    }),

    prisma.payment.aggregate({
      where: {
        appointment: {
          patientId: patient.id,
        },
        status: PaymentStatus.PAID,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.payment.aggregate({
      where: {
        appointment: {
          patientId: patient.id,
        },
        status: PaymentStatus.REFUNDED,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const totalAmountSpent =
    totalAmountSpentResult._sum.amount?.toNumber() || 0;

  const totalRefunded =
    totalRefundedResult._sum.amount?.toNumber() || 0;

  return {
    totalAppointments,
    upcomingAppointments,
    completedAppointments,
    cancelledAppointments,
    totalAmountSpent,
    totalRefunded,
  };
};
const getDoctorAnalytics = async (user: requestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!doctor) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Doctor Profile Not Found",
    );
  }

  const [
    totalSchedules,
    publishedSchedules,
    totalAppointments,
    upcomingAppointments,
    ongoingAppointments,
    completedAppointments,
    cancelledAppointments,
    totalDoctorRefundedResult,
    totalDoctorEarningsResult,
  ] = await Promise.all([
    prisma.schedule.count({
      where: {
        doctorId: doctor.id,
        isDeleted: false,
      },
    }),

    prisma.schedule.count({
      where: {
        doctorId: doctor.id,
        isDeleted: false,
        status: ScheduleStatus.PUBLISHED,
      },
    }),

    prisma.apppointment.count({
      where: {
        doctorId: doctor.id,
      },
    }),

    prisma.apppointment.count({
      where: {
        doctorId: doctor.id,
        status: AppointmentStatus.CONFIRMED,
      },
    }),

    prisma.apppointment.count({
      where: {
        doctorId: doctor.id,
        status: AppointmentStatus.ONGOING,
      },
    }),

    prisma.apppointment.count({
      where: {
        doctorId: doctor.id,
        status: AppointmentStatus.COMPLETED,
      },
    }),

    prisma.apppointment.count({
      where: {
        doctorId: doctor.id,
        status: AppointmentStatus.CANCELLED,
      },
    }),

    prisma.payment.aggregate({
      where: {
        appointment: {
          doctorId: doctor.id,
        },
        status: PaymentStatus.REFUNDED,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.payment.aggregate({
      where: {
        appointment: {
          doctorId: doctor.id,
        },
        status: PaymentStatus.PAID,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const totalDoctorRefunded =
    totalDoctorRefundedResult._sum.amount?.toNumber() || 0;

  const totalDoctorEarnings =
    totalDoctorEarningsResult._sum.amount?.toNumber() || 0;

  return {
    totalSchedules,
    publishedSchedules,
    totalAppointments,
    upcomingAppointments,
    ongoingAppointments,
    completedAppointments,
    cancelledAppointments,
    totalDoctorEarnings,
    totalDoctorRefunded,
  };
};

export const AnalyticsServices = {
  getAdminAnalytics,
  getPatientAnalytics,
  getDoctorAnalytics,
};
