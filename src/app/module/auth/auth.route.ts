/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { validationRequest } from "../../middleware/validationMiddleware";
import { registerUserSchema } from "./auth.validation";

const router = Router();


router.post("/register",validationRequest(registerUserSchema) ,AuthController.registerPatient);
router.post("/login", AuthController.loginUser);
router.post("/google", AuthController.googleLogin);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);

export const AuthRoutes = router;
