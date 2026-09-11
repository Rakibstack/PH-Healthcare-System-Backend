import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
// biome-ignore lint/style/useImportType: <explanation>
import { requestUser } from "../../middleware/checkAuth";

const bookAppointment = async (payload: any, user: requestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
      },
    });

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new Error("Bkash Access Token Not Found.");
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
          amount: "1200",
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
        amount: "1200",
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

const payAppointment = async (payload: any, user: requestUser) => {
  const appointmentId = payload.appointmentId;
  const appointmentExist = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
  });
  if (!appointmentExist) {
    throw new Error("Appointment dose not exist");
  }
  if (appointmentExist.status !== "PENDING") {
    throw new Error("Appointment is not pending");
  }

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error("Bkash Access Token Not Found.");
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
        amount: "1200",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: appointmentExist.id,
      }),
    },
  );

  const createBkashPaymentResult = await createBkashPaymentResponse.json();
  await prisma.payment.update({
    where: {
      id: appointmentExist.id,
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
      throw new Error("payment is Not Found");
    }
    const status = query.status;
    if (!status) {
      throw new Error("Status Is Missing");
    }

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new Error("Bkash Access Token Not Found.");
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
      throw new Error("Bkash Execute Payment Failed");
    }
    const executePaymentResult = await executePaymentResponse.json();

    if (status === "success") {
      await tx.appointment.update({
        where: {
          id: executePaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
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

export const appointmentService = {
  bookAppointment,
  bookAppointmentCallback,
};
