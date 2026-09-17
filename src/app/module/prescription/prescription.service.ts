/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */

import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { ICreatePrescriptionPayload } from "./prescription.interface";
import { requestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { UploadApiResponse } from "cloudinary";
import cloudinary from "../../lib/claudinary";
import path from "node:path";
import ejs from "ejs"

const createPrescription = async (
  payload: ICreatePrescriptionPayload,
  user: requestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const appointment = await prisma.apppointment.findUnique({
    where: { id: payload.appointmentId, doctorId: doctor.id },
    include: { patient: true },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
  }

  if (appointment.status !== AppointmentStatus.COMPLETED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Prescription Can Only Be Written For A Completed Appointment",
    );
  }

  if (appointment.prescriptionUrl) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A Prescription Already Exists For This Appointment",
    );
  }

  const pdfDocument = new PDFDocument({ margin: 50 });

  const pdfChunks: Buffer[] = [];

  pdfDocument.on("data", (chunk: Buffer) => {
    pdfChunks.push(chunk);
  });

  const pdfReadyPromise = new Promise<Buffer>((resolve) => {
    pdfDocument.on("end", () => {
      resolve(Buffer.concat(pdfChunks));
    });
  });

  //pdf contents

  // PDF Header
  pdfDocument
    .fontSize(22)
    .fillColor("#0f766e")
    .font("Helvetica-Bold")
    .text("PH Healthcare System", {
      align: "center",
    });

  pdfDocument
    .fontSize(10)
    .fillColor("#64748b")
    .font("Helvetica")
    .text("Digital Healthcare & Telemedicine Platform", {
      align: "center",
    });

  pdfDocument.moveDown(0.5);

  pdfDocument
    .strokeColor("#0f766e")
    .lineWidth(2)
    .moveTo(50, pdfDocument.y)
    .lineTo(545, pdfDocument.y)
    .stroke();

  pdfDocument.moveDown(1.5);

  // Title
  pdfDocument
    .fontSize(18)
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .text("MEDICAL PRESCRIPTION", {
      align: "center",
    });

  pdfDocument.moveDown(1.5);

  // Patient / Doctor Information
  const infoTop = pdfDocument.y;

  pdfDocument
    .fontSize(9)
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .text("PATIENT", 50, infoTop);

  pdfDocument
    .fontSize(12)
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .text(appointment.patient.name, 50, infoTop + 14);

  pdfDocument
    .fontSize(10)
    .fillColor("#475569")
    .font("Helvetica")
    .text(appointment.patient.email, 50, infoTop + 31);

  pdfDocument
    .fontSize(9)
    .fillColor("#64748b")
    .font("Helvetica-Bold")
    .text("DOCTOR", 320, infoTop);

  pdfDocument
    .fontSize(12)
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .text(`Dr. ${doctor.name}`, 320, infoTop + 14);

  pdfDocument
    .fontSize(10)
    .fillColor("#475569")
    .font("Helvetica")
    .text(doctor.specialization, 320, infoTop + 31);

  pdfDocument.y = infoTop + 55;

  // Appointment Information
  pdfDocument
    .fontSize(12)
    .fillColor("#0f766e")
    .font("Helvetica-Bold")
    .text("APPOINTMENT INFORMATION");

  pdfDocument.moveDown(0.6);

  pdfDocument
    .fontSize(10)
    .fillColor("#334155")
    .font("Helvetica")
    .text(`Appointment ID: ${appointment.id}`);

  pdfDocument.text(`Date: ${new Date().toDateString()}`);

  pdfDocument.text(`Status: ${appointment.status}`);

  pdfDocument.moveDown(1);

  // Findings
  pdfDocument
    .fontSize(12)
    .fillColor("#0f766e")
    .font("Helvetica-Bold")
    .text("CLINICAL FINDINGS");

  pdfDocument.moveDown(0.5);

  pdfDocument
    .fontSize(10)
    .fillColor("#334155")
    .font("Helvetica")
    .text(payload.findings, {
      lineGap: 4,
    });

  pdfDocument.moveDown(1.5);

  // Medicines
  pdfDocument
    .fontSize(12)
    .fillColor("#0f766e")
    .font("Helvetica-Bold")
    .text("PRESCRIBED MEDICINES");

  pdfDocument.moveDown(0.7);

  // Table header
  const tableTop = pdfDocument.y;

  pdfDocument.rect(50, tableTop, 495, 25).fill("#f1f5f9");

  pdfDocument.fontSize(9).fillColor("#334155").font("Helvetica-Bold");

  pdfDocument.text("MEDICINE", 58, tableTop + 8);
  pdfDocument.text("DOSAGE", 220, tableTop + 8);
  pdfDocument.text("DURATION", 315, tableTop + 8);
  pdfDocument.text("INSTRUCTIONS", 405, tableTop + 8);

  pdfDocument.y = tableTop + 32;

  // Medicine rows
  payload.medicines.forEach((medicine, index) => {
    const rowY = pdfDocument.y;

    // alternating row background
    if (index % 2 === 0) {
      pdfDocument.rect(50, rowY - 4, 495, 42).fill("#f8fafc");
    }

    pdfDocument
      .fontSize(9)
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .text(medicine.name, 58, rowY);

    pdfDocument
      .font("Helvetica")
      .fillColor("#334155")
      .text(medicine.dosage, 220, rowY);

    pdfDocument.text(medicine.duration, 315, rowY);

    pdfDocument.text(medicine.instructions || "-", 405, rowY, {
      width: 130,
    });

    pdfDocument.y = rowY + 45;
  });

  // Doctor signature
  pdfDocument.moveDown(2);

  const signatureY = pdfDocument.y;

  pdfDocument
    .moveTo(370, signatureY)
    .lineTo(520, signatureY)
    .strokeColor("#334155")
    .stroke();

  pdfDocument
    .fontSize(10)
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .text(`Dr. ${doctor.name}`, 370, signatureY + 7, {
      width: 150,
      align: "center",
    });

  pdfDocument
    .fontSize(9)
    .fillColor("#64748b")
    .font("Helvetica")
    .text(doctor.specialization, 370, signatureY + 22, {
      width: 150,
      align: "center",
    });

  // Footer
  pdfDocument
    .fontSize(8)
    .fillColor("#94a3b8")
    .text(
      "This prescription was digitally issued through PH Healthcare System.",
      50,
      760,
      {
        width: 495,
        align: "center",
      },
    );

  const pdfBuffer = await pdfReadyPromise;

  const uploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: "raw", format: "pdf" },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  "No Result Returned From Cloudinary",
                ),
              );
            }

            resolve(result);
          },
        )
        .end(pdfBuffer);
    },
  );

  const updatedAppointment = await prisma.apppointment.update({
    where: { id: appointment.id },
    data: {
      prescriptionUrl: uploadResult.secure_url,
      prescriptionPublicId: uploadResult.public_id,
    },
  });
  const templatePath = path.join(
    process.cwd(),
    "src/app/template/prescription.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    patientName: appointment.patient.name,
    doctorName: doctor.name,
    specialization: doctor.specialization,
    prescriptionNumber: `RX-${appointment.id.slice(-8).toUpperCase()}`,
    appointmentDate: new Date().toDateString(),
    year: new Date().getFullYear(),
  });

 await transporter.sendMail({
  from: config.sender_email,
  to: appointment.patient.email,
  subject: "Your Prescription - PH Healthcare System",
  html,
  attachments: [
    {
      filename: "prescription.pdf",
      content: pdfBuffer,
      contentType: "application/pdf",
    },
  ],
});

  return updatedAppointment;
};

const getSinglePrescription = async (
  appointmentId: string,
  user: requestUser,
) => {
  const appointment = await prisma.apppointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { id: true, name: true, userId: true } },
      doctor: { select: { id: true, name: true, userId: true } },
    },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
  }

  if (user.role === Role.PATIENT) {
    if (appointment.patient.userId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Appointment",
      );
    }
  }
  if (user.role === Role.DOCTOR) {
    if (appointment.doctor.userId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Appointment",
      );
    }
  }

  if (!appointment.prescriptionUrl) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No Prescription Has Been Written Yet",
    );
  }

  return {
    appointment,
    prescription: appointment.prescriptionUrl,
  };
};

export const PrescriptionServices = {
  createPrescription,
  getSinglePrescription,
};
