/** biome-ignore-all lint/style/useConst: <explanation> */
/** biome-ignore-all assist/source/organizeImports: <explanation> */
import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { jwtUtils } from "../../utils/jwt";
import type {
  IForgotPasswordPayload,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IResetPasswordPayload,
  IVerifyPatientEmailPayload,
} from "./auth.interface";
import { googleClient } from "../../lib/googleAuth";
import type { TokenPayload } from "google-auth-library";
// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import path from "path";
import AppError from "../../utils/AppError";
import httpstatus from "http-status";
import { prisma } from "../../lib/prisma";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new AppError(
      httpstatus.CONFLICT,
      "User with this email already exists",
    );
  }

  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds),
  );

  const expiresInSeconds = 5 * 60;
  const otpKey = `patient-register-otp:${email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expiresInSeconds,
    },
  });

  const patientRegisterkey = `patient-register-data:${email}`;
  const patientRegisterData = {
    name,
    email,
    password: hashedPassword,
    patient: {
      name,
      email,
    },
  };
  await redisClient.set(
    patientRegisterkey,
    JSON.stringify(patientRegisterData),
    {
      expiration: {
        type: "EX",
        value: expiresInSeconds,
      },
    },
  );

  const templatePath = path.join(
    process.cwd(),
    "src/app/template/patientRegisterOTP.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    name: name,
    otpValue,
    expiresIn: expiresInSeconds / 60,
  });

  await transporter.sendMail({
    from: config.sender_email,
    to: email,
    subject: "Email Verification OTP Send.",
    html,
  });
};

const verifyPatientEmail = async (payload: IVerifyPatientEmailPayload) => {
  const email = payload.email.trim().toLowerCase();
  const otp = payload.otp;

  const otpKey = `patient-register-otp:${email}`;

  const redisOtp = await redisClient.get(otpKey);
  if (!redisOtp) {
    throw new AppError(httpstatus.BAD_REQUEST, "Invalid Otp");
  }
  if (redisOtp !== otp) {
    throw new AppError(httpstatus.BAD_REQUEST, "Otp does not match");
  }
  await redisClient.del(otpKey);

  const patientRegisterkey = `patient-register-data:${email}`;
  const redisPatientData = await redisClient.get(patientRegisterkey);
  if (!redisPatientData) {
    throw new AppError(httpstatus.NOT_FOUND, "User Does Not Exists");
  }
  const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

  const createdUser = await prisma.user.create({
    data: {
      name: patientPayload.name,
      email: patientPayload.email,
      password: patientPayload.password,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      patient: {
        create: {
          name: patientPayload.name,
          email: patientPayload.email,
        },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  await redisClient.del(patientRegisterkey);

  const templatePath = path.join(
    process.cwd(),
    "src/app/template/PH-WellcomeEmail.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    name: patientPayload.name,
  });

  await transporter.sendMail({
    from: config.sender_email,
    to: email,
    subject: "Welcome to PH Healthcare System",
    html,
  });

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {

  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email : payload.email },
  });

  if (!user) {
    throw new AppError(httpstatus.NOT_FOUND, "User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(httpstatus.FORBIDDEN, "User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new AppError(httpstatus.BAD_REQUEST, "User is deleted");
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new AppError(httpstatus.UNAUTHORIZED, "Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | null | undefined = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });
    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Google Id Token Varified Failed", error);
    throw new AppError(
      httpstatus.UNAUTHORIZED,
      "Invalid Or Expired Google Id Token",
    );
  }

  if (!googleIdTokenPayload) {
    throw new AppError(
      httpstatus.UNAUTHORIZED,
      "Invalid Or Expired Google Id Token",
    );
  }

  if (!googleIdTokenPayload.email) {
    throw new AppError(httpstatus.BAD_REQUEST, "Google User Email Not Found");
  }

  if (!googleIdTokenPayload.name) {
    throw new AppError(httpstatus.BAD_REQUEST, "Google User Name Not Found");
  }

  const isPatientExistWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = isPatientExistWithGoogleAuth;

  if (!isPatientExistWithGoogleAuth) {
    const isPatientExistWithCredential = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (isPatientExistWithCredential) {
      if (!isPatientExistWithCredential.emailVerified) {
        throw new AppError(httpstatus.FORBIDDEN, "User Email Not Varified");
      }
      if (isPatientExistWithCredential.status === UserStatus.BLOCKED) {
        throw new AppError(httpstatus.FORBIDDEN, "User Is Blocked");
      }
      if (
        isPatientExistWithCredential.isDeleted ||
        isPatientExistWithCredential.status === UserStatus.DELETED
      ) {
        throw new AppError(httpstatus.NOT_FOUND, "User Is Deleted");
      }
      user = await prisma.user.update({
        where: {
          id: isPatientExistWithCredential.id,
        },
        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    }
  } else {
    user = await prisma.user.create({
      data: {
        name: googleIdTokenPayload.name,
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        googleId: googleIdTokenPayload.sub,
        authProvider: AuthProvider.GOOGLE,
        emailVerified: true,
        patient: {
          create: {
            name: googleIdTokenPayload.name,
            email: googleIdTokenPayload.email,
          },
        },
      },
    });
    const templatePath = path.join(
      process.cwd(),
      "src/app/template/PH-WellcomeEmail.ejs",
    );

    const html = await ejs.renderFile(templatePath, {
      name: googleIdTokenPayload.name,
    });

    await transporter.sendMail({
      from: config.sender_email,
      to: googleIdTokenPayload.email,
      subject: "Welcome to PH Healthcare System",
      html,
    });
  }
  if (!user) {
    throw new AppError(httpstatus.NOT_FOUND, "User Not Found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new AppError(httpstatus.NOT_FOUND, "User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new AppError(httpstatus.UNAUTHORIZED, "Invalid refresh token");
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new AppError(
      httpstatus.UNAUTHORIZED,
      "User is inactive or not found",
    );
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const { email } = payload;

  const isForgotUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isForgotUserExist) {
    throw new AppError(httpstatus.NOT_FOUND, "User does not exists");
  }
  if (!isForgotUserExist.emailVerified) {
    throw new AppError(httpstatus.FORBIDDEN, "User Is Not Varified");
  }

  if (isForgotUserExist.status === "BLOCKED") {
    throw new AppError(httpstatus.FORBIDDEN, "User is Blocked");
  }
  if (isForgotUserExist.isDeleted || isForgotUserExist.status === "DELETED") {
    throw new AppError(httpstatus.NOT_FOUND, "User Is Deleted");
  }
  if (
    isForgotUserExist.googleId &&
    isForgotUserExist.authProvider === "GOOGLE"
  ) {
    throw new AppError(httpstatus.BAD_REQUEST, "User Has Account With Google");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `forgot-password-otp:${isForgotUserExist.email}`;

  const expiresInSecend = 5 * 60;
  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: expiresInSecend,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/template/forgot-password.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    name: isForgotUserExist.name,
    otp,
    expiresIn: expiresInSecend / 60,
  });

  await transporter.sendMail({
    from: config.sender_email,
    to: isForgotUserExist.email,
    subject: "Forgot Password",
    html,
  });
};
const resetPassword = async (payload: IResetPasswordPayload) => {
  const { otp, newPassword, email } = payload;

  const isResetUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isResetUserExist) {
    throw new AppError(httpstatus.NOT_FOUND, "User does not exists");
  }
  if (!isResetUserExist.emailVerified) {
    throw new AppError(httpstatus.FORBIDDEN, "User Is Not Varified");
  }

  if (isResetUserExist.status === "BLOCKED") {
    throw new AppError(httpstatus.FORBIDDEN, "User is Blocked");
  }
  if (isResetUserExist.isDeleted || isResetUserExist.status === "DELETED") {
    throw new AppError(httpstatus.NOT_FOUND, "User Is Deleted");
  }
  if (isResetUserExist.googleId && isResetUserExist.authProvider === "GOOGLE") {
    throw new AppError(httpstatus.BAD_REQUEST, "User Has Account With Google");
  }
  const key = `forgot-password-otp:${isResetUserExist.email}`;

  const redisOtp = await redisClient.get(key);
  if (!redisOtp) {
    throw new AppError(httpstatus.BAD_REQUEST, "Invalid Otp");
  }
  if (redisOtp !== otp) {
    throw new AppError(httpstatus.BAD_REQUEST, "Otp does not match");
  }
  const hashPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: {
      email: isResetUserExist.email,
    },
    data: {
      password: hashPassword,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/template/reset-password.ejs",
  );

  const html = await ejs.renderFile(templatePath, {
    name: isResetUserExist.name,
  });

  await transporter.sendMail({
    from: config.sender_email,
    to: isResetUserExist.email,
    subject: "Change Password",
    html,
  });

  await redisClient.del(key);
};

export const AuthService = {
  registerPatient,
  loginUser,
  verifyPatientEmail,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
