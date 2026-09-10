// biome-ignore assist/source/organizeImports: <explanation>
import { Router } from "express";
import { appointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  appointmentController.bookAppointment,
);
router.get(
  "/book-appointment/payment/callback",
  appointmentController.bookAppointmentCallback,
);

export const appointmentRoutes = router;
