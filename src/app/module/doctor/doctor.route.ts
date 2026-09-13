/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Router } from "express";
import { doctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";
import { validationRequest } from "../../middleware/validationMiddleware";
import { applyAsDoctorZodSchema, approveDoctorSchema, verifyDoctorEmailSchema } from "./doctor.validation";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/apply-as-doctor",
  validationRequest(applyAsDoctorZodSchema),
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "additionalFile", maxCount: 10 },
  ]),
  doctorController.applyAsDoctor,
);
router.post(
  "/apply-as-doctor/verify-email",
  validationRequest(verifyDoctorEmailSchema),
  doctorController.verifyDoctorEmail,
);
router.post(
  "/approve-doctor",
  validationRequest(approveDoctorSchema),
  auth(Role.ADMIN,Role.SUPER_ADMIN), 
  doctorController.approveDoctor,
);
router.post(
  "/all-doctors",
  auth(Role.ADMIN,Role.SUPER_ADMIN), 
  doctorController.getAllDoctor,
);

export const doctorRoutes = router;
