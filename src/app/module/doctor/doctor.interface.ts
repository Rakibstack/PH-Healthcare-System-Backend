import { DoctorVerificationStatus, Role } from "../../../generated/prisma/enums";

export interface IApplyAsDoctorPayload {
  user: {
    name: string;
    email: string;
  };
  doctor: {
    address?: string;
    contactNumber?: string;
    bio?: string;
    specialization: string;
    licenseNumber: string;
    qualification: string;
    experienceYears: number;
  };
}

export interface IverifyDoctorEmail {
  email: string;
  otp: string;
}

export interface IApproveDoctorPayload {
  doctorId: string;
  verificationStatus: DoctorVerificationStatus;
  rejectionReason?: string;

}
