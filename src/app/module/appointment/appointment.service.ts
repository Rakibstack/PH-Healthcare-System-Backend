/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import {
  AppointmentStatus,
  PaymentStatus,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import AppError from "../../utils/AppError";
import httpstatus from "http-status";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
// biome-ignore lint/style/useImportType: <explanation>
import { requestUser } from "../../middleware/checkAuth";
import {
  IBookAppointmentPayload,
  ICancelAppointmentPayload,
  IPayAppointmentPayload,
} from "./appointment.interface";
import httpStatus from "http-status";
import { addMinutes, isBefore, isSameDay } from "date-fns";

const bookAppointment = async (
  payload: IBookAppointmentPayload,
  user: requestUser,
) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    // business logic

    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient) {
      throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: payload.scheduleId },
      include: { doctor: true },
    });

    if (!schedule || schedule.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status !== ScheduleStatus.PUBLISHED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Published Yet",
      );
    }

    const now = new Date();

    if (!isSameDay(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Available Today",
      );
    }

    if (!isBefore(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Has Already Started",
      );
    }

    const existingAppointment = await prisma.apppointment.findFirst({
      where: {
        patientId: patient.id,
        scheduleId: schedule.id,
      },
    });

    if (existingAppointment?.status === AppointmentStatus.PENDING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Pending Appointment. Please Pay For That",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Confirmed Appointment.",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.ONGOING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Ongoing Appointment",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
      );
    }

    if (schedule.availableSlots === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Fully Booked",
      );
    }

    if (!schedule.doctor.consultationFee) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Doctor Has Not Set A Consultation Fee Yet",
      );
    }

    const amount = schedule.doctor.consultationFee.toString();

    const appointment = await tx.apppointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new AppError(
        httpstatus.BAD_REQUEST,
        "Bkash Access Token Not Found.",
      );
    }

    const createBkashPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: user.email, // email or phone number
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
          amount: amount,
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );

    const createBkashPaymentResult = await createBkashPaymentResponse.json();

    await tx.payment.create({
      data: {
        merchantInvoiceNumber: createBkashPaymentResult.merchantInvoiceNumber,
        amount: amount,
        appointmentId: appointment.id,
        gatewayResponse: createBkashPaymentResult,
        bkashPaymentId: createBkashPaymentResult.paymentID,
        payerReference: user.email,
      },
    });
    return {
      paymentURL: createBkashPaymentResult.bkashURL,
    };
  });
  return transactionResult;
};

const payAppointment = async (
  payload: IPayAppointmentPayload,
  user: requestUser,
) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.userId },
  });

  if (!patient) {
    throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
  }

  const appointmentExist = await prisma.apppointment.findUnique({
    where: {
      id: payload.appointmentId,
    },
    include: {
      schedule: {
        include: {
          doctor: true,
        },
      },
    },
  });
  if (!appointmentExist) {
    throw new AppError(httpstatus.NOT_FOUND, "Appointment dose not exist");
  }
  if (appointmentExist.status !== "PENDING") {
    throw new AppError(httpstatus.CONFLICT, "Appointment is not pending");
  }

  const amount = appointmentExist.schedule.doctor.consultationFee?.toString();

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new AppError(httpstatus.BAD_REQUEST, "Bkash Access Token Not Found.");
  }

  const createBkashPaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email, // email or phone number
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: amount,
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: appointmentExist.id,
      }),
    },
  );

  const createBkashPaymentResult = await createBkashPaymentResponse.json();
  await prisma.payment.update({
    where: {
      appointmentId: appointmentExist.id,
    },
    data: {
      merchantInvoiceNumber: createBkashPaymentResult.merchantInvoiceNumber,
      gatewayResponse: createBkashPaymentResult,
      bkashPaymentId: createBkashPaymentResult.paymentID,
    },
  });

  return {
    paymentURL: createBkashPaymentResult.bkashURL,
  };
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const paymentId = query.paymentID;
    if (!paymentId) {
      throw new AppError(httpstatus.NOT_FOUND, "payment is Not Found");
    }
    const status = query.status;
    if (!status) {
      throw new AppError(httpstatus.BAD_REQUEST, "Status Is Missing");
    }

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new AppError(
        httpstatus.BAD_REQUEST,
        "Bkash Access Token Not Found.",
      );
    }

    const executePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: paymentId,
        }),
      },
    );
    if (!executePaymentResponse.ok) {
      throw new AppError(
        httpstatus.INTERNAL_SERVER_ERROR,
        "Bkash Execute Payment Failed",
      );
    }
    const executePaymentResult = await executePaymentResponse.json();

    if (status === "success") {
      const appointment = await prisma.apppointment.findUnique({
        where: {
          id: executePaymentResult.merchantInvoiceNumber,
        },
        include: {
          schedule: true,
        },
      });

      if (!appointment) {
        throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found.");
      }

      const alreadyBookedSlots =
        appointment.schedule.totalSlots - appointment.schedule.availableSlots;
      const serialNumber = alreadyBookedSlots + 1;

      const joiningTime = addMinutes(
        appointment.schedule.startDateTime,
        (serialNumber - 1) * 20,
      );

      await tx.apppointment.update({
        where: {
          id: executePaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
          joiningTime,
          serialNumber,
        },
      });
      
      const newAvailableSlots = appointment?.schedule.availableSlots - 1;
      await tx.schedule.update({
        where: {
          id: appointment.schedule.id,
        },
        data: {
          availableSlots: newAvailableSlots,
        },
      });

      await tx.payment.update({
        where: {
          appointmentId: executePaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: PaymentStatus.PAID,
          bkashTrxId: executePaymentResult.trxID,
          paidAt: executePaymentResult.paymentExecuteTime,
          gatewayResponse: executePaymentResult,
        },
      });

      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
      };
    } else if (status === "failure") {
      await tx.payment.update({
        where: {
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: executePaymentResult,
        },
      });
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=false`,
      };
    } else if (status === "cancel") {
      await tx.payment.update({
        where: {
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.CANCELLED,
          gatewayResponse: executePaymentResult,
        },
      });
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
      };
    } else {
      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment_failed`,
      };
    }
  });

  return transactionResult;
};

const cancelAppointment = async (payload: ICancelAppointmentPayload) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload.appointmentId;
    const appointmentExist = await tx.apppointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        payment: true,
      },
    });
    if (!appointmentExist) {
      throw new AppError(httpstatus.NOT_FOUND, "Appointment dose not exist");
    }
    if (
      appointmentExist.status === "ONGOING" ||
      appointmentExist.status === "COMPLETED"
    ) {
      throw new AppError(
        httpstatus.CONFLICT,
        "Appointment is Ongoing or Completed",
      );
    }
    if (appointmentExist.status === "CANCELLED") {
      throw new AppError(httpstatus.CONFLICT, "Appointment Already Cancelled");
    }
    const updateAppointment = await tx.apppointment.update({
      where: {
        id: appointmentExist.id,
      },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
    });

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new AppError(
        httpstatus.BAD_REQUEST,
        "Bkash Access Token Not Found.",
      );
    }

    const BkashRefundResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: appointmentExist.payment?.bkashPaymentId,
          trxID: appointmentExist.payment?.bkashTrxId,
          amount: appointmentExist.payment?.amount,
          sku: "Appointment Cancelled",
          reason: "Patient Cancel The Appointment.",
        }),
      },
    );

    const bkashRefundResult = await BkashRefundResponse.json();

    const updatePayment = await tx.payment.update({
      where: {
        appointmentId: appointmentExist.id,
      },
      data: {
        refundTrxId: bkashRefundResult.refundTrxID,
        refundAmount: bkashRefundResult.amount,
        refundAt: bkashRefundResult.completedTime,
        refundReason: "Patient Cancel The Appointment.",
        status: PaymentStatus.REFUNDED,
        gatewayResponse: bkashRefundResult,
      },
    });

    return {
      appointment: updateAppointment,
      payment: updatePayment,
    };
  });

  return transactionResult;
};

export const appointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment,
};
