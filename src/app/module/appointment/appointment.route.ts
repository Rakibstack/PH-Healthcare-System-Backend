// biome-ignore assist/source/organizeImports: <explanation>
import { Router } from "express";
import { appointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validationRequest } from "../../middleware/validationMiddleware";
import { BookAppointmentValidationZodSchema, UpdateAppointmentStatusValidationZodSchema } from "./appointment.validation";

const router = Router();

router.post(
  "/book-appointment",
  validationRequest(BookAppointmentValidationZodSchema),
  auth(Role.PATIENT),
  appointmentController.bookAppointment,
);
router.post(
  "/pay-appointment",
  auth(Role.PATIENT),
  appointmentController.payAppointment,
);
router.post(
  "/cancel-appointment",
  auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  appointmentController.cancelAppointment,
);
router.get(
  "/book-appointment/payment/callback",
  appointmentController.bookAppointmentCallback,
);

router.patch(
  "/update-appointment-status",
  validationRequest(UpdateAppointmentStatusValidationZodSchema),
  auth(Role.DOCTOR),
  appointmentController.updateAppointmentStatus,
);

export const appointmentRoutes = router;
