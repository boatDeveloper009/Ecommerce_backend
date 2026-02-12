import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import {v2 as cloudinary} from "cloudinary"

export const getAllUsers = catchAsyncError(async (req, res, next)=>{
    const page = parseInt(req.query.page) || 1;

    const totlUsersResult = await database.query(`
        SELECT COUNT(*) FROM users WHERE role = $1`, ["User"])
    
    const totalUsers = parseInt(totlUsersResult.rows[0].count)

    const offSet = (page - 1) * 10;
    const users = await database.query(`
        SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`
        , ["User", 10, offSet]   )

    res.status(200).json({
        success: true,
        totalUsers,
        currentPage: page,
        users: users.rows
    })
})

export const deleteUser = catchAsyncError(async (req, res, next)=>{
    const {id} = req.params;

    const deletedUser = await database.query(`DELETE FROM users WHERE id = $1 RETURNING *`, [id])

    if(deletedUser.rows.length === 0){
        return next(new ErrorHandler("User not found", 404));
    }

    const avatar = deletedUser.rows[0].avatar;
    if(avatar?.public_id){
        await cloudinary.uploader.destroy(avatar.public_id)
    }

    res.status(200).json({
        success: true,
        message: "User deleted successfully"
    })
})

export const dashBoardStats = catchAsyncError(async (req, res, next)=>{
    const today = new Date();
    const todayDate = today.toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format

    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const yesterdayDate = yesterday.toISOString().split("T")[0]; // Get yesterday's date in YYYY-MM-DD format

    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1) 
    const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0) // Last day of previous month

    const totalRevenueAllTimeQuery = await database.query(`
        SELECT SUM(total_price) FROM orders
        `)
    
    const totalRevenueAllTime = parseFloat(totalRevenueAllTimeQuery.rows[0].sum) || 0;

    // total users
    const totalUsersQuery = await database.query(`SELECT COUNT(*) FROM users WHERE role = $1`, ["User"])
    const totalUsersCount = parseInt(totalUsersQuery.rows[0].count) || 0;

    // orders status counts
    const ordersStatusCountsQuery = await database.query(`
        SELECT order_status, COUNT(*) FROM orders GROUP BY order_status
        `)

    const ordersStatusCounts = {
        Processing: 0,
        Shipped: 0,
        Delivered: 0,
        Cancelled: 0
    };

    ordersStatusCountsQuery.rows.forEach(row =>{
        ordersStatusCounts[row.order_status] = parseInt(row.count)
    })

    // today's revenue
    const todaysRevenueQuery = await database.query(`
        SELECT SUM(total_price) FROM orders WHERE created_at::date = $1
        `, [todayDate])

    const todaysRevenue = parseFloat(todaysRevenueQuery.rows[0].sum) || 0;

    // yesterday's revenue
    const yesterdaysRevenueQuery = await database.query(`
        SELECT SUM(total_price) FROM orders WHERE created_at::date = $1
        `, [yesterdayDate])

    const yesterdaysRevenue = parseFloat(yesterdaysRevenueQuery.rows[0].sum) || 0;

    // monthly sales for line chart
    const monthlySalesQuery = await database.query(`
        SELECT TO_CHAR(created_at, 'Mon YYYY') AS month,
        DATE_TRUNC('month', created_at) AS date,
        SUM(total_price) AS totalSales
        FROM orders
        GROUP BY month, date
        ORDER BY date ASC
        `)

    const monthlySales = monthlySalesQuery.rows.map(row => ({
        month: row.month,
        totalSales: parseFloat(row.totalSales)
    }))


    // top 5 selling products
    const topSellingProductsQuery = await database.query(`
        SELECT p.name,
        p.images->0->>'url' AS image,
        p.category,
        p.ratings,
        SUM(oi.quantity) AS total_sold
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        GROUP BY p.name, p.images, p.category, p.ratings
        ORDER BY total_sold DESC
        LIMIT 5
        `)

    const topSellingProducts = topSellingProductsQuery.rows;

    // total sales for current month
    const currentMonthSalesQuery = await database.query(`
        SELECT SUM (total_price) AS total
        FROM orders
        WHERE created_at BETWEEN $1 AND $2
        `, [currentMonthStart, currentMonthEnd])

    const currentMonthSales = parseFloat(currentMonthSalesQuery.rows[0].total) || 0;

    // products with low stock (<= 5)
    const lowStockProductsQuery = await database.query(`
        SELECT name, stock FROM products WHERE stock <= 5 ORDER BY stock ASC
        `)

    const lowStockProducts = lowStockProductsQuery.rows;

    // revenue growth rate(%)
        const lastMonthRevenueQuery = await database.query(`
            SELECT SUM(total_price) AS total
            FROM orders
            WHERE created_at BETWEEN $1 AND $2
            `, [previousMonthStart, previousMonthEnd])

    const lastMonthRevenue = parseFloat(lastMonthRevenueQuery.rows[0].total) || 0

    let revenueGrowth = "0%"

    if(lastMonthRevenue > 0){
        const growthRate = ((currentMonthSales - lastMonthRevenue) / lastMonthRevenue) * 100;
        revenueGrowth = `${growthRate > 0 ? "+" : ""}${growthRate.toFixed(2)}%`
    }

    // new users this month
    const newUsersThisMonthQuery = await database.query(`
        SELECT COUNT(*) FROM users WHERE created_at >= $1 AND role = $2
        `, [currentMonthStart, "User"])

    const newUsersThisMonth = parseInt(newUsersThisMonthQuery.rows[0].count) || 0;

    res.status(200).json({
        success: true,
        message: "Dashboard stats fetched successfully",
        todaysRevenue,
        yesterdaysRevenue,
        totalRevenueAllTime,
        totalUsersCount,
        ordersStatusCounts,
        monthlySales,
        currentMonthSales,
        topSellingProducts,
        lowStockProducts,
        revenueGrowth,
        newUsersThisMonth

    })



})


