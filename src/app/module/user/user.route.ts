/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Router } from "express";
import { userController } from "./user.controller";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.patch(
  "/profile-image",
  auth(Role.ADMIN, Role.PATIENT, Role.DOCTOR,Role.SUPER_ADMIN),
  upload.single("profileImage"),
  userController.updateUserProfile,
);

export const userRoutes = router;
