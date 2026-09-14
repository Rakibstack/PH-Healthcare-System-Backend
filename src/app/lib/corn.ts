/** biome-ignore-all assist/source/organizeImports: <explanation> */
import cron from "node-cron";
import { prisma } from "./prisma";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";

const deleteUnverifiedDoctor = () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const oneHourAgo = new Date(
        Date.now() - 60 * 60 * 1000,
      );

      const deletedDoctor = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          emailVerified: false,
          createdAt: {
            lt: oneHourAgo,
          },
          doctor: {
            verificationStatus:
              DoctorVerificationStatus.PENDING,
          },
        },
      });

      if (deletedDoctor.count > 0) {
        console.log(
          `Cron: Deleted ${deletedDoctor.count} unverified doctor applications older than 1 hour`,
        );
      }
    } catch (error) {
      console.error(
        "Cron: Failed to delete unverified doctor applications",
        error,
      );
    }
  });

  console.log(
    "Doctor delete cron scheduled to run every 10 minutes",
  );
};

export default deleteUnverifiedDoctor;
