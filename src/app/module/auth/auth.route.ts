/** biome-ignore-all assist/source/organizeImports: <explanation> */
import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { validationRequest } from "../../middleware/validationMiddleware";
import { forgotPasswordSchema, LoginUserSchema, registerUserSchema, resetPasswordSchema } from "./auth.validation";

const router = Router();


router.post("/register",validationRequest(registerUserSchema) ,AuthController.registerPatient);
router.post("/login",validationRequest(LoginUserSchema) ,AuthController.loginUser);
router.post("/google", AuthController.googleLogin);
router.post("/forgot-password", validationRequest(forgotPasswordSchema),AuthController.forgotPassword);
router.post("/reset-password",validationRequest(resetPasswordSchema), AuthController.resetPassword);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);

export const AuthRoutes = router;
