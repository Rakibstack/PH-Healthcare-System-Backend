/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Router } from "express";
import { doctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";

const router = Router();

router.post(
  "/apply-as-doctor",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "additionalFile", maxCount: 10 },
  ]),
  doctorController.applyAsDoctor,
);

export const doctorRoutes = router;
