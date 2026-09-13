
import { z } from "zod";
import { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export const applyAsDoctorZodSchema = z.object({
  user: z.object({
    name: z
      .string()
      .trim()
      .min(3, "Name must be at least 3 characters long")
      .max(50, "Name must not exceed 50 characters"),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email address"),
  }),

  doctor: z.object({
    specialization: z
      .string()
      .trim()
      .min(2, "Specialization is required")
      .max(100, "Specialization must not exceed 100 characters"),

    licenseNumber: z
      .string()
      .trim()
      .min(3, "License number is required")
      .max(50, "License number must not exceed 50 characters"),

    qualification: z
      .string()
      .trim()
      .min(2, "Qualification is required")
      .max(100, "Qualification must not exceed 100 characters"),

    experienceYears: z
      .number()
      .int("Experience years must be a whole number")
      .min(0, "Experience years cannot be negative")
      .max(60, "Experience years seems invalid"),

    address: z
      .string()
      .trim()
      .max(255, "Address must not exceed 255 characters")
      .optional(),

    contactNumber: z
      .string()
      .trim()
      .min(10, "Contact number must be at least 10 characters")
      .max(20, "Contact number must not exceed 20 characters")
      .optional(),

    bio: z
      .string()
      .trim()
      .max(1000, "Bio must not exceed 1000 characters")
      .optional(),
  }),
});

export const verifyDoctorEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),
    otp: z.string().length(6) 
});


export const approveDoctorSchema = z.object({
  doctorId: z
    .string()
    .trim()
    .min(1, "Doctor ID is required"),

  verificationStatus: z.enum(DoctorVerificationStatus, {
    error: "Invalid verification status",
  }),

  rejectionReason: z
    .string()
    .trim()
    .max(300, "Rejection reason must not exceed 300 characters")
    .optional(),
});


