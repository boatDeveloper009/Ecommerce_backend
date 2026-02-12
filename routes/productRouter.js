import { createProduct, deleteProduct, deleteReview, fetchAIFilteredProducts, fetchAllProducts, fetchSingleProduct, postProductReview, updateProduct } from "../controllers/productController.js"
import express from "express";
import { isAuthenticated, authorizedRoles} from "../middlewares/authMiddleware.js";


const productRouter = express.Router();

productRouter.post("/admin/create", isAuthenticated, authorizedRoles("Admin"), createProduct)
productRouter.get("/", fetchAllProducts)
productRouter.put("/admin/update/:productId", isAuthenticated, authorizedRoles("Admin"), updateProduct)
productRouter.delete("/admin/delete/:productId", isAuthenticated, authorizedRoles("Admin"), deleteProduct)
productRouter.get("/product/:productId", fetchSingleProduct)
productRouter.put("/post-new/review/:productId", isAuthenticated, authorizedRoles("User"), postProductReview)
productRouter.delete("/user/delete-review/:productId", isAuthenticated, authorizedRoles("User"), deleteReview)
productRouter.post("/ai-search", isAuthenticated, fetchAIFilteredProducts)

export default productRouter;