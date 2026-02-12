import {createOrderItemsTable} from "../models/orderItemsTable.js"
import {createOrdersTable} from "../models/ordersTable.js"
import {createPaymentsTable} from "../models/paymentsTable.js"
import {createProductReviewsTable} from "../models/productReviewsTable.js"
import {createProductTable} from "../models/productTable.js"
import {createShippingInfoTable} from "../models/shippingInfoTable.js"
import {createUserTable} from "../models/userTable.js"

export const createTables = async()=>{
    try {
        await createUserTable()
        await createProductTable() 
        await createProductReviewsTable()
        await createOrdersTable()
        await createOrderItemsTable()
        await createShippingInfoTable()
        await createPaymentsTable()
        console.log("All tables created successfully")
    } catch (error) {
        console.log("Error creating tables:", error)
    }
}