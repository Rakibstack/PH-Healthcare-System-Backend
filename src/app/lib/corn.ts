/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "./prisma";
import cron from "node-cron"

const cleanupDoctorApplications = async () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
      //  Delete unverified pending doctors older than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const deletedUnverifiedDoctor = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          emailVerified: false,
          createdAt: {
            lt: oneHourAgo,
          },
          doctor: {
            verificationStatus: DoctorVerificationStatus.PENDING,
          },
        },
      });

      // Delete rejected doctors older than 1 month
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const deletedRejectedDoctor = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          doctor: {
            verificationStatus: DoctorVerificationStatus.REJECTED,
            rejectedAt: {
              lt: oneMonthAgo,
            },
          },
        },
      });

      if (
        deletedUnverifiedDoctor.count > 0 ||
        deletedRejectedDoctor.count > 0
      ) {
        console.log(
          `Cron: Deleted ${deletedUnverifiedDoctor.count} unverified and ${deletedRejectedDoctor.count} rejected doctor applications`,
        );
      }
    } catch (error) {
      console.error("Cron: Doctor application cleanup failed", error);
    }
  });

  console.log("Doctor application cleanup cron scheduled every 10 minutes");
};

export default cleanupDoctorApplications;