import { Router } from "express";
import { appointmentController } from "./appointment.controller";

const router = Router()

router.post('/book-appointment', appointmentController.bookAppointment);
router.get('/book-appointment/payment/callback', appointmentController.bookAppointmentCallback);

export const appointmentRoutes = router;