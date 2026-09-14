/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { UploadApiResponse } from "cloudinary";
import AppError from "../../utils/AppError";
import httpstatus from "http-status";
import { prisma } from "../../lib/prisma";
import {
  IApplyAsDoctorPayload,
  IApproveDoctorPayload,
  IverifyDoctorEmail,
} from "./doctor.interface";
import cloudinary from "../../lib/claudinary";
import {
  DoctorVerificationStatus,
  Role,
} from "../../../generated/prisma/enums";
import bcrypt from "bcryptjs";
import config from "../../config";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import { IRequestUser } from "../auth/auth.interface";
import { IQuery } from "../../interface";
import { DoctorWhereInput } from "../../../generated/prisma/models";

const applyAsDoctor = async (
  payload: IApplyAsDoctorPayload,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  const isUserExist = await prisma.user.findUnique({
    where: {
      email: payload.user.email,
    },
  });

  if (isUserExist) {
    throw new AppError(
      httpstatus.CONFLICT,
      "User Already Exist With This Email",
    );
  }
  const resumeUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
        },
        (error, result) => {
          if (error) {
            reject(new Error(error.message));
            return;
          }

          if (!result) {
            reject(new Error("Cloudinary upload failed"));
            return;
          }
          resolve(result);
        },
      );

      uploadStream.end(resume?.buffer);
    },
  );

  const additionalFileUploadResult = await Promise.all(
    additionalFiles.map((file) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: "auto",
          },
          (error, result) => {
            if (error) {
              reject(new Error(error.message));
              return;
            }

            if (!result) {
              reject(new Error("Cloudinary upload failed"));
              return;
            }
            resolve(result);
          },
        );

        uploadStream.end(file.buffer);
      });
    }),
  );
  const randomPassword = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(
    randomPassword,
    Number(config.bcrypt_salt_rounds),
  ); // Replace this with your actual password hashing logic
  const doctorAppointment = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashedPassword,
      role: Role.DOCTOR,
      needPasswordChange: true,
      doctor: {
        create: {
          name: payload.user.name,
          email: payload.user.email,
          ...payload.doctor,
          resume: resumeUploadResult.secure_url,
          resumePublicId: resumeUploadResult.public_id,
          additionalFiles: additionalFileUploadResult.map((file) => ({
            url: file.secure_url,
            publicId: file.public_id,
          })),
        },
      },
    },
    include: {
      doctor: true,
    },
  });

  const expiresInSeconds = 60 * 60;
  const otpKey = `doctor-emailVerify-otp:${payload.user.email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expiresInSeconds,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/template/doctorEmailVerificationOTP.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    name: payload.user.name,
    otpValue,
    expiresIn: 60,
  });

  await transporter.sendMail({
    from: config.sender_email,
    to: payload.user.email,
    subject: "Doctor Email Verification OTP Send.",
    html,
  });

  return doctorAppointment;
};

const verifyDoctorEmail = async (payload: IverifyDoctorEmail) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
      role: Role.DOCTOR,
    },
  });

  if (!existingUser) {
    throw new AppError(
      httpstatus.NOT_FOUND,
      "Doctor Application Not Found. Please Apply Again",
    );
  }
  if (existingUser.emailVerified) {
    throw new AppError(httpstatus.CONFLICT, "Email Already Varified");
  }

  const otpKey = `doctor-emailVerify-otp:${email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new AppError(
      httpstatus.BAD_REQUEST,
      "OTP Expired. Your Application Window Has Closed. Please Apply Again",
    );
  }

  if (redisOtp !== otp) {
    throw new AppError(httpstatus.BAD_REQUEST, "Otp Does Not Match");
  }

  await redisClient.del(otpKey);

  const verifyUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      emailVerified: true,
    },
    omit: { password: true },
    include: { doctor: true },
  });

  return verifyUser;
};

const approveDoctor = async (
  payload: IApproveDoctorPayload,
  reviewer: IRequestUser,
) => {
  const { doctorId, verificationStatus, rejectionReason } = payload;

  const existingDoctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { user: true },
  });
  if (!existingDoctor) {
    throw new AppError(httpstatus.NOT_FOUND, "Doctor Application Not Found.");
  }
  if (existingDoctor.isDeleted) {
    throw new AppError(
      httpstatus.NOT_FOUND,
      "Doctor Application Has Been Deleted",
    );
  }
  if (!existingDoctor.user.emailVerified) {
    throw new AppError(
      httpstatus.FORBIDDEN,
      "Doctor Has Not Verified Their Email Yet.Application Can Not Be reviewed ",
    );
  }

  if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
    throw new AppError(
      httpstatus.CONFLICT,
      `Doctor Application Has Already Been ${existingDoctor.verificationStatus.toLowerCase()}`,
    );
  }

  if (
    verificationStatus === DoctorVerificationStatus.REJECTED &&
    !rejectionReason
  ) {
    throw new AppError(
      httpstatus.BAD_REQUEST,
      "Rejection Reason Is Required When Rejecting A Doctor Application",
    );
  }

  const updateDoctor = await prisma.doctor.update({
    where: {
      id: doctorId,
    },
    data: {
      verificationStatus,
      rejectionReason:
        verificationStatus === DoctorVerificationStatus.REJECTED
          ? rejectionReason
          : null,
      reviewedBy: reviewer.userId,
      reviewedAt: new Date(),
    },
  });

  const isApproved = verificationStatus === DoctorVerificationStatus.VERIFIED;

  const templateName = isApproved
    ? "doctorApplicationApproved.ejs"
    : "doctorApplicationRejected.ejs";

  const templatePath = path.join(
    process.cwd(),
    `src/app/template/${templateName}`,
  );

  const html = await ejs.renderFile(templatePath, {
    name: updateDoctor.name,
    rejectionReason: updateDoctor.rejectionReason,
  });

  await transporter.sendMail({
    from: config.sender_email,
    to: updateDoctor.email,
    subject: isApproved
      ? "Your Doctor Application Has Been Approved"
      : "Your Doctor Application Has Been Rejected",
    html,
  });

  return updateDoctor;
};

const getAllDoctor = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;

  const addConditions: DoctorWhereInput[] = [];

  //searcing
  if (query.searchTerm) {
    addConditions.push({
      OR: [
        {
          name: {
            contains: query.searchTerm,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: query.searchTerm,
            mode: "insensitive",
          },
        },
        {
          specialization: {
            contains: query.searchTerm,
            mode: "insensitive",
          },
        },
        {
          licenseNumber: {
            contains: query.searchTerm,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  //filtering
  if (query.specialization) {
    addConditions.push({
      specialization: { equals: query.specialization, mode: "insensitive" },
    });
  }
  if (query.email) {
    addConditions.push({
      email: { contains: query.email, mode: "insensitive" },
    });
  }
  if (query.licenseNumber) {
    addConditions.push({
      licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
    });
  }
  if (query.verificationStatus) {
    addConditions.push({
      verificationStatus: query.verificationStatus as DoctorVerificationStatus,
    });
  }

  addConditions.push({
    isDeleted: false,
  });

  const totalDoctor = await prisma.doctor.count({
    where: {
      AND: addConditions,
    },
  });
  const allDoctors = await prisma.doctor.findMany({
    where: {
      AND: addConditions,
    },
    take: limit,
    skip: skip,
    orderBy: {
      createdAt: "desc",
    },
    include: {
      user: {
        omit: {
          password: true,
        },
      },
    },
  });
  return {
    data: allDoctors,
    meta: {
      page: page,
      limit: limit,
      total: totalDoctor,
      totalPages: Math.ceil(totalDoctor / limit),
    },
  };
};

export const doctorService = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctor,
};
