/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { IApplyAsDoctorPayload, IverifyDoctorEmail } from "./doctor.interface";
import cloudinary from "../../lib/claudinary";
import { Role } from "../../../generated/prisma/enums";
import bcrypt from "bcryptjs";
import config from "../../config";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";

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
    throw new Error("User Already Exist With This Email");
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
    throw new Error("Doctor Application Not Found. Please Apply Again");
  }
  if (existingUser.emailVerified) {
    throw new Error("Email Already Varified");
  }

  const otpKey = `doctor-emailVerify-otp:${email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new Error(
      "OTP Expired. Your Application Window Has Closed. Please Apply Again",
    );
  }

  if (redisOtp !== otp) {
    throw new Error("Otp Does Not Match");
  }

  await redisClient.del(otpKey);

  const verifyUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      emailVerified: true,
    },
    omit : {password : true},
    include: {doctor: true}
  });

  return verifyUser;
};

export const doctorService = {
  applyAsDoctor,
  verifyDoctorEmail,
};
