import { config } from "dotenv";
config(); 

import express from "express"
import productRouter from "./routes/productRouter.js";



import cookieParser from "cookie-parser"
import cors from "cors"
import fileUpload from "express-fileupload"
import { createTables } from "./utils/createTables.js"
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import authrouter from "./routes/authRouter.js";
import adminRouter from "./routes/adminRouter.js";
import Stripe from "stripe";

import database from "./database/db.js";
import orderRouter from "./routes/orderRouter.js";

export const app = express()







app.use(cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}))

app.post("/api/v1/payment/webhook", express.raw({type: "application/json"}), async (req, res)=>{
    const sig = req.headers["stripe-signature"]
    let event;
    try {
        event = Stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (error) {
        return res.status(400).send(`Webhook Error: ${error.message || error}`)
    }

    // Handle the event
    if(event.type === "payment_intent.succeeded"){
        const paymentIntent_client_secret = event.data.object.client_secret
        try {
            // update payment status in db
            const updatePaymentStatus = "Paid"
            const paymentTableUpdateQuery = await database.query(`UPDATE payments SET payment_status = $1
                WHERE payment_intent_id = $2 RETURNING *`, [updatePaymentStatus, paymentIntent_client_secret])

             await database.query(`UPDATE orders SET paid_at = NOW()
                WHERE id = $1 RETURNING *`, [paymentTableUpdateQuery.rows[0].order_id])
            
            // reduce stock of product
            const orderId = paymentTableUpdateQuery.rows[0].order_id
            const {rows: orderedItems} = await database.query(`
                SELECT product_id, quantity FROM order_items WHERE order_id = $1
                `, [orderId])
            
            // reduce stock for each product
            for(const item of orderedItems){
                await database.query(`
                    UPDATE products SET stock = stock - $1 WHERE id = $2`, [item.quantity, item.product_id])
            }
        } catch (error) {
            return res.status(500).send(`Error updating paid_at timestamp: ${error.message || error}`)
        }
    }
    res.status(200).json({received: true})
})

app.use(cookieParser())
app.use(express.json())
app.use(express.urlencoded({extended:true}))

app.use(fileUpload({
    tempFileDir: "./uploads",
    useTempFiles: true
}))

app.use("/api/v1/auth", authrouter)
app.use("/api/v1/products", productRouter)
app.use("/api/v1/admin", adminRouter)
app.use("/api/v1/order", orderRouter)

app.use(errorMiddleware)

createTables()