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

  const totalDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
    },
  });

  const totalPendingDoctorApplications = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificationStatus: DoctorVerificationStatus.PENDING,
    },
  });

  const totalApprovedDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificationStatus: DoctorVerificationStatus.VERIFIED,
    },
  });
  const totalRejectedDoctors = await prisma.doctor.count({
    where: {
      isDeleted: false,
      verificationStatus: DoctorVerificationStatus.REJECTED,
    },
  });

  const totalPatients = await prisma.patient.count({
    where: { isDeleted: false },
  });

  const totalAppointments = await prisma.apppointment.count();

  const totalCompletedAppointments = await prisma.apppointment.count({
    where: { status: AppointmentStatus.COMPLETED },
  });

  const totalCancelledAppointments = await prisma.apppointment.count({
    where: { status: AppointmentStatus.CANCELLED },
  });

  const totalRefundResult = await prisma.payment.aggregate({
    where: {
      status: PaymentStatus.PAID,
    },
    _sum: {
      amount: true,
    },
  });

  const totalRefunded = totalRefundResult._sum.amount?.toNumber() || 0;

  const totalRevenueResult = await prisma.payment.aggregate({
    where: {
      status: PaymentStatus.PAID,
    },
    _sum: {
      amount: true,
    },
  });

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
    totalRevenue,
    totalRefunded,
  };
};


export const AnalyticsServices = {
  getAdminAnalytics,
}
