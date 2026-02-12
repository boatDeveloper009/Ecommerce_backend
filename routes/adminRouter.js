import express from "express"
import { dashBoardStats, deleteUser, getAllUsers } from "../controllers/adminController.js"
import { isAuthenticated, authorizedRoles} from "../middlewares/authMiddleware.js"

const adminRouter = express.Router()

adminRouter.get("/get-all-users", isAuthenticated, authorizedRoles("Admin"), getAllUsers)
adminRouter.delete("/delete-user/:id", isAuthenticated, authorizedRoles("Admin"), deleteUser)
adminRouter.get("/dashboard-stats", isAuthenticated, authorizedRoles("Admin"), dashBoardStats)



export default adminRouter