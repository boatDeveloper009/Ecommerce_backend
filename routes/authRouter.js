import express from "express";
import { forgotPassword, getUser, login, logout, register, resetPassword, updatePassword, updateProfile, verifyEmail } from "../controllers/authController.js";
import { isAuthenticated } from "../middlewares/authMiddleware.js";

const authrouter = express.Router();

authrouter.post("/register", register);
authrouter.post("/verify-email", verifyEmail);
authrouter.post("/login", login)
authrouter.get("/me", isAuthenticated, getUser)
authrouter.get("/logout", isAuthenticated, logout)
authrouter.post("/password/forgot", forgotPassword)
authrouter.put("/password/reset/:token", resetPassword)
authrouter.put("/password/update", isAuthenticated, updatePassword)
authrouter.put("/profile/update", isAuthenticated, updateProfile)


export default authrouter;