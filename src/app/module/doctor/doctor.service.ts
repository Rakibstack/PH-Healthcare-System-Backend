/** biome-ignore-all lint/style/useImportType: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { IApplyAsDoctor } from "./doctor.interface";
import cloudinary from "../../lib/claudinary";
import { Role } from "../../../generated/prisma/enums";
import bcrypt from "bcryptjs";
import config from "../../config";

const applyAsDoctor = async (
  payload: IApplyAsDoctor,
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
    include : {
        doctor : true
    }
  });

  return doctorAppointment;
};

export const doctorService = {
  applyAsDoctor,
};
