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
  IUpdateAppointmentStatusPayload,
} from "./appointment.interface";
import httpStatus from "http-status";
import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import { format } from "date-fns";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import path from "node:path";
import PDFDocument from "pdfkit";
import { IRequestUser } from "../auth/auth.interface";
import { ApppointmentWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../interface";

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
          patient: true,
          doctor: true,
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

      const templatePath = path.join(
        process.cwd(),
        "src/app/template/appointmentConfirmed.ejs",
      );

      const html = await ejs.renderFile(templatePath, {
        patientName: appointment.patient.name,

        appointmentId: appointment.id,

        serialNumber: appointment.serialNumber,

        doctorName: appointment.doctor.name,

        specialization: appointment.doctor.specialization,

        appointmentDate: format(
          appointment.schedule.startDateTime,
          "dd MMMM yyyy",
        ),

        appointmentTime: `${format(
          appointment.schedule.startDateTime,
          "hh:mm a",
        )} - ${format(appointment.schedule.endDateTime, "hh:mm a")}`,

        amount: appointment.doctor.consultationFee,

        meetingLink: appointment.schedule.meetingLink,
      });

      const pdfDocument = new PDFDocument({ margin: 50, size: "A4" });
      const pdfChunks: Buffer[] = [];

      pdfDocument.on("data", (chunk: Buffer) => {
        pdfChunks.push(chunk);
      });

      const pdfReadyPromise = new Promise<Buffer>((resolve) => {
        pdfDocument.on("end", () => {
          resolve(Buffer.concat(pdfChunks));
        });
      });

      const PRIMARY_COLOR = "#1A365D";
      const SECONDARY_COLOR = "#4A5568";
      const TEXT_COLOR = "#2D3748";
      const BORDER_COLOR = "#E2E8F0";

      pdfDocument
        .fillColor(PRIMARY_COLOR)
        .fontSize(24)
        .text("PH Healthcare System", {
          align: "center",
        });

      pdfDocument
        .fillColor(SECONDARY_COLOR)
        .fontSize(12)
        .text("Appointment Invoice", { align: "center" })
        .moveDown(1.5);

      pdfDocument
        .moveTo(50, pdfDocument.y)
        .lineTo(545, pdfDocument.y)
        .strokeColor(BORDER_COLOR)
        .stroke()
        .moveDown(1.5);

      const topOfSection = pdfDocument.y;

      pdfDocument
        .fillColor(PRIMARY_COLOR)
        .fontSize(12)
        .text("Patient Details", 50, topOfSection, { underline: true })
        .moveDown(0.5)
        .fillColor(TEXT_COLOR)
        .fontSize(10)
        .text(`Name: ${appointment.patient?.name}`)
        .text(`Email: ${appointment.patient?.email}`);

      pdfDocument
        .fillColor(PRIMARY_COLOR)
        .fontSize(12)
        .text("Doctor Details", 320, topOfSection, { underline: true })
        .moveDown(0.5)
        .fillColor(TEXT_COLOR)
        .fontSize(10)
        .text(`Name: ${appointment.doctor?.name}`)
        .text(`Specialization: ${appointment.doctor?.specialization}`);

      pdfDocument.y = topOfSection + 65;
      pdfDocument.x = 50;

      pdfDocument
        .fillColor(PRIMARY_COLOR)
        .fontSize(12)
        .text("Schedule & Meeting Info")
        .moveDown(0.5);

      pdfDocument
        .fillColor(TEXT_COLOR)
        .fontSize(10)
        .text(`Date: ${appointment.schedule.startDateTime.toDateString()}`)
        .text(`Serial Number: ${serialNumber}`)
        .text(`Joining Time: ${joiningTime.toString()}`)
        .fillColor("#3182CE")
        .text(`Meeting Link: ${appointment.schedule.meetingLink}`)
        .moveDown(1.5);

      pdfDocument.rect(50, pdfDocument.y, 495, 20).fill(PRIMARY_COLOR);

      pdfDocument
        .fillColor("#FFFFFF")
        .fontSize(10)
        .text("Payment Description", 60, pdfDocument.y + 5)
        .text("Details", 320, pdfDocument.y - 10);

      pdfDocument.y += 15;

      const paymentData = [
        { label: "Payment Method", value: "bKash" },
        { label: "Transaction ID", value: executePaymentResult.trxID },
        { label: "Paid At", value: executePaymentResult.paymentExecuteTime },
      ];

      paymentData.forEach((row) => {
        pdfDocument
          .fillColor(TEXT_COLOR)
          .text(row.label, 60, pdfDocument.y + 5)
          .text(row.value, 320, pdfDocument.y - 10);

        pdfDocument.y += 10;
        pdfDocument
          .moveTo(50, pdfDocument.y)
          .lineTo(545, pdfDocument.y)
          .strokeColor(BORDER_COLOR)
          .stroke();
      });

      pdfDocument.moveDown(1);
      pdfDocument
        .rect(320, pdfDocument.y, 225, 30)
        .fillColor("#EDF2F7")
        .rect(320, pdfDocument.y, 225, 30)
        .fill();

      pdfDocument
        .fillColor(PRIMARY_COLOR)
        .fontSize(11)
        .text(
          `Amount Paid: ${executePaymentResult.amount} BDT`,
          330,
          pdfDocument.y - 20,
        );

      pdfDocument
        .fillColor(SECONDARY_COLOR)
        .fontSize(9)
        .text("Thank you for choosing PH Healthcare System!", 50, 720, {
          align: "center",
        });

      pdfDocument.end();

      const pdfBuffer = await pdfReadyPromise;

      await transporter.sendMail({
        from: config.sender_email,
        to: appointment.patient.email,
        subject: "Appointment Confirmed - PH Healthcare System",
        html,
        attachments: [
          {
            filename: `invoice_${appointment.id || "invoice"}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
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

const cancelAppointment = async (
  payload: ICancelAppointmentPayload,
  user: IRequestUser,
) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentExist = await tx.apppointment.findUnique({
      where: {
        id: payload.appointmentId,
        patient: {
          email: user.email,
        },
      },
      include: {
        payment: true,
        schedule: true,
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
    await tx.schedule.update({
      where: {
        id: appointmentExist.schedule.id,
      },
      data: {
        availableSlots: { increment: 1 },
      },
    });

    // refund logic here
    const now = new Date();
    const startDateTime = appointmentExist.schedule.startDateTime;

    const refundCutOfTime = subHours(startDateTime, 1);
    const isEligibleForRefund = isBefore(now, refundCutOfTime);

    if (isEligibleForRefund) {
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

      await tx.payment.update({
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
    }

    const newPaymentInfo = await tx.payment.findUnique({
      where: {
        appointmentId: appointmentExist.id,
      },
    });

    return {
      appointment: updateAppointment,
      payment: newPaymentInfo,
    };
  });

  return transactionResult;
};

// DOCTOR ONLY CONFIRMED => ONGOING => COMPLETED
const updateAppointmentStatus = async (
  appointmentId: string,
  payload: IUpdateAppointmentStatusPayload,
  user: requestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const appointment = await prisma.apppointment.findUnique({
    where: { id: appointmentId, doctorId: doctor.id },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
  }

  if (appointment.status === AppointmentStatus.COMPLETED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Appointment is already completed",
    );
  }

  if (appointment.status === AppointmentStatus.CANCELLED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Appointment is already cancelled",
    );
  }
  if (appointment.status === AppointmentStatus.PENDING) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Appointment is Pending. You can change the status after appointment is confirmed",
    );
  }

  if (appointment.status === AppointmentStatus.CONFIRMED) {
    if (payload.status !== "ONGOING") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Confirmed Appointment Must Be Ongoing At First",
      );
    }

    await prisma.apppointment.update({
      where: {
        id: appointment.id,
      },
      data: {
        status: AppointmentStatus.ONGOING,
      },
    });
  }

  if (appointment.status === AppointmentStatus.ONGOING) {
    if (payload.status !== "COMPLETED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Ongoing Appointment Must Be Complted.",
      );
    }

    await prisma.apppointment.update({
      where: {
        id: appointment.id,
      },
      data: {
        status: AppointmentStatus.COMPLETED,
      },
    });
  }

  const updatedAppointment = await prisma.apppointment.findUnique({
    where: {
      id: appointment.id,
    },
  });

  return updatedAppointment;
};

//patient appointments
const getMyAppointments = async (query : IQuery, user : requestUser) => {


	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
	}

	const andConditions: ApppointmentWhereInput[] = [
		{
			patientId : patient.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

//doctor appointments
const getDoctorAppointments = async (query: IQuery, user: requestUser) => {

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const andConditions: ApppointmentWhereInput[] = [
		{
			doctorId : doctor.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			patient: {
				select: { id: true, name: true, email: true, contactNumber: true },
			},
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}


export const appointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  getMyAppointments,
  getDoctorAppointments
};
