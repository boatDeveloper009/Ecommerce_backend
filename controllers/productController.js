import { catchAsyncError } from "../middlewares/catchAsyncError.js"
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import { v2 as cloudinary } from "cloudinary"
import { getAIRecommendation } from "../utils/getAIRecommendations.js";


export const createProduct = catchAsyncError(async (req, res, next) => {
    const { name, description, price, category, stock } = req.body;
    const created_by = req.user.id;

    if (!name || !description || !price || !category || !stock) {
        return next(new ErrorHandler("Please provide all required fields", 400));
    }

    let uploadedImages = []
    if (req.files && req.files.images) {
        const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images];

        for (const image of images) {
            const result = await cloudinary.uploader.upload(image.tempFilePath, {
                folder: "Ecommerce_Product_Images",
                width: 1000,
                crop: "scale"
            })

            uploadedImages.push({
                public_id: result.public_id,
                url: result.secure_url
            })
        }
    }

    const product = await database.query(`
           INSERT INTO products (name, description, price, category, stock, images, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [name, description, price / 93, category, stock, JSON.stringify(uploadedImages), created_by])

    res.status(201).json({
        success: true,
        message: "Product created successfully",
        product: product.rows[0]
    })
})

export const fetchAllProducts = catchAsyncError(async (req, res, next) => {
    const { availability, price, category, ratings, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10
    const offset = (page - 1) * limit;

    const conditions = []
    let values = []
    let index = 1

    let paginationPlaceholder = {}

    // Filtering by availability
    if (availability === "in-stock") {
        conditions.push(`stock > 5`)
    } else if (availability === "limited") {
        conditions.push(`stock > 0 AND stock <= 5`)
    } else if (availability === "out-of-stock") {
        conditions.push(`stock = 0`)
    }

    // Filtering by price
    if (price) {
        const [minPrice, maxPrice] = price.split("-")
        if (minPrice && maxPrice) {
            conditions.push(`price BETWEEN $${index} AND $${index + 1}`)
            values.push(minPrice, maxPrice)
            index += 2
        }
    }

    // Filtering by category
    if (category) {
        conditions.push(`category ILIKE $${index}`)
        values.push(`%${category}%`)
        index++
    }

    // Filtering by ratings
    if (ratings) {
        conditions.push(`ratings >= $${index}`)
        values.push(ratings)
        index++
    }

    // add search query
    if (search) {
        conditions.push(`(p.name ILIKE $${index} OR p.description ILIKE $${index})`)
        values.push(`%${search}%`)
        index++
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
    //get count of filtered products
    const totalProductsResult = await database.query(`
        SELECT COUNT(*) FROM products p ${whereClause}`, values)

    const totalProducts = parseInt(totalProductsResult.rows[0].count)

    paginationPlaceholder.limit = `$${index}`
    values.push(limit)
    index++

    paginationPlaceholder.offset = `$${index}`
    values.push(offset)
    index++

    // fetch with reviews
    const query = `
        SELECT p.*, COUNT(r.id) AS review_count
        FROM products p
        LEFT JOIN reviews r ON p.id = r.product_id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT ${paginationPlaceholder.limit}
        OFFSET ${paginationPlaceholder.offset}
    `;

    const result = await database.query(query, values)

    // Fetch new products added in the last 30 days
    const newProductsQuery = `
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.created_at >= Now() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
    `;

    const newProductsResult = await database.query(newProductsQuery)

    // Fetch top-rated products with ratings 4.5 and above
    const topRatedQuery = `
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.ratings >= 4.5
    GROUP BY p.id
    ORDER BY p.ratings DESC, p.created_at DESC
    LIMIT 8
    `;

    const topRatedResult = await database.query(topRatedQuery)

    res.status(200).json({
        success: true,
        products: result.rows,
        totalProducts,
        newProducts: newProductsResult.rows,
        topRatedProducts: topRatedResult.rows
    })
})

export const updateProduct = catchAsyncError(async (req, res, next) => {
    const { productId } = req.params
    const { name, description, price, category, stock } = req.body
    if (!name || !description || !price || !category || !stock) {
        return next(new ErrorHandler("Please provide all required fields", 400));
    }

    const product = await database.query(`SELECT * FROM products WHERE id = $1`, [productId])
    if (product.rows.length === 0) {
        return next(new ErrorHandler("Product not found", 404));
    }

    const result = await database.query(`
        UPDATE products SET name = $1, description = $2, price = $3, category = $4, stock = $5 WHERE id = $6 RETURNING *
        `, [name, description, price / 93, category, stock, productId])

    res.status(200).json({
        success: true,
        message: "Product updated successfully",
        updatedProduct: result.rows[0]
    })
})

export const deleteProduct = catchAsyncError(async (req, res, next) => {
    const { productId } = req.params
    const product = await database.query(`SELECT * FROM products WHERE id = $1`, [productId])
    if (product.rows.length === 0) {
        return next(new ErrorHandler("Product not found", 404));
    }

    const images = product.rows[0].images;

    // Delete product from database
    const deleteResult = await database.query(`DELETE FROM products WHERE id = $1 RETURNING *`, [productId])
    if (deleteResult.rows.length === 0) {
        return next(new ErrorHandler("Failed to delete product", 500));
    }
    // Delete images from cloudinary
    if (images && images.length > 0) {
        for (const image of images) {
            await cloudinary.uploader.destroy(image.public_id)
        }
    }
    res.status(200).json({
        success: true,
        message: "Product deleted successfully",
    })
})

export const fetchSingleProduct = catchAsyncError(async (req, res, next) => {
    const { productId } = req.params

    const result = await database.query(`
        SELECT p.*,
        COALESCE(
        json_agg(
        json_build_object(
        'review_id', r.id,
        'rating', r.rating,
        'comment', r.comment,
        'reviewer', json_build_object(
        'id', u.id,
        'name', u.name,
        'avatar', u.avatar)
        )
        )
        FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reviews
         FROM products p
         LEFT JOIN reviews r ON p.id = r.product_id
         LEFT JOIN users u ON r.user_id = u.id
         WHERE p.id = $1
         GROUP BY p.id
        `, [productId])

    res.status(200).json({
        success: true,
        message: "Product fetched successfully",
        product: result.rows[0]
    })
})

export const postProductReview = catchAsyncError(async (req, res, next) => {
    const { productId } = req.params
    const { rating, comment } = req.body

    if (!rating || !comment) {
        return next(new ErrorHandler("Please provide all required fields", 400));
    }

    const purchasheCheckQuery = `
        SELECT oi.product_id
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN payments p ON p.order_id = o.id
        WHERE o.buyer_id = $1
        AND oi.product_id = $2
        AND p.payment_status = 'Paid'
        LIMIT 1
        `;

    const { rows } = await database.query(purchasheCheckQuery, [req.user.id, productId])

    if (rows.length === 0) {
        return res.json({
            success: false,
            message: "You can only review products you have purchased."
        })
    }

    const product = await database.query(`SELECT * FROM products WHERE id = $1`, [productId])
    if (product.rows.length === 0) {
        return next(new ErrorHandler("Product not found", 404));
    }

    const existingReview = await database.query(`
        SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2
        `, [productId, req.user.id])

    let review;
    if (existingReview.rows.length > 0) {
        // Update existing review
        review = await database.query(`
            UPDATE reviews SET rating = $1, comment = $2 WHERE product_id = $3
            AND user_id = $4 RETURNING *`, [rating, comment, productId, req.user.id])
    } else {
        // Create new review
        review = await database.query(`
            INSERT INTO reviews (product_id, user_id, rating, comment)
            VALUES ($1, $2, $3, $4) RETURNING *`, [productId, req.user.id, rating, comment])
    }

    const allReviews = await database.query(`
        SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1`, [productId])

    const avgRating = allReviews.rows[0].avg_rating
    const updatedProduct = await database.query(`
        UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *`, [avgRating, productId])

    res.status(200).json({
        success: true,
        message: "Review submitted successfully",
        review: review.rows[0],
        updatedProduct: updatedProduct.rows[0]
    })
})

export const deleteReview = catchAsyncError(async (req, res, next) => {
    const { productId } = req.params

    const review = await database.query(`DELETE FROM reviews WHERE product_id = $1
        AND user_id = $2 RETURNING *`, [productId, req.user.id])

    if (review.rows.length === 0) {
        return next(new ErrorHandler("Review not found", 404));
    }

    const allReviews = await database.query(`
        SELECT AVG(rating) AS avg_rating FROM reviews WHERE product_id = $1`, [productId])

    const avgRating = allReviews.rows[0].avg_rating
    const updatedProduct = await database.query(`
        UPDATE products SET ratings = $1 WHERE id = $2 RETURNING *`, [avgRating, productId]
    )

    res.status(200).json({
        success: true,
        message: "Review deleted successfully",
        updatedProduct: updatedProduct.rows[0]
    })
})

export const fetchAIFilteredProducts = catchAsyncError(async (req, res, next) => {
  const { userPrompt } = req.body;
  if (!userPrompt) {
    return next(new ErrorHandler("Please provide a prompt", 400));
  }

  const keyWords = filterKeywords(userPrompt);

  const result = await database.query(`
    SELECT * FROM products 
    WHERE name ILIKE ANY($1)
    OR description ILIKE ANY($1)
    OR category ILIKE ANY($1)
    LIMIT 100
  `, [keyWords]);

  const filteredProducts = result.rows;

  if (filteredProducts.length === 0) {
    return res.status(200).json({
      success: true,
      products: [],
      message: "No products found matching the given prompt."
    });
  }

  try {
    const aiProducts = await getAIRecommendation(userPrompt, filteredProducts);

    return res.status(200).json({
      success: true,
      message: "Products fetched successfully by AI",
      products: aiProducts
    });

  } catch (error) {
    // fallback if AI fails (429 etc)
    return res.status(200).json({
      success: true,
      message: "AI is unavailable right now, returning basic filtered products",
      products: filteredProducts,
      aiError: error.message
    });
  }
});


 const filterKeywords = (query) => {
        const stopWords = new Set([
            // basic English stopwords
            "a", "an", "the", "and", "or", "but", "if", "then", "else",
            "for", "to", "from", "in", "on", "at", "by", "with", "about",
            "as", "of", "into", "over", "under", "between", "within", "without",
            "is", "are", "was", "were", "be", "been", "being",
            "do", "does", "did", "doing",
            "have", "has", "had", "having",
            "can", "could", "will", "would", "should", "may", "might", "must",
            "i", "me", "my", "mine", "we", "our", "ours", "you", "your", "yours",
            "he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs",
            "this", "that", "these", "those",
            "it", "its",
            "what", "which", "who", "whom", "whose", "why", "how",
            "all", "any", "both", "each", "few", "more", "most", "some", "such",
            "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
            "just", "also", "again", "once", "here", "there", "when", "where",

            // ecommerce common filler words
            "buy", "purchase", "order", "shop", "shopping",
            "product", "products", "item", "items",
            "show", "find", "get", "give", "want", "need", "looking",
            "cheap", "cheaper", "cheapest", "low", "lowest",
            "best", "top", "good", "better", "great",
            "latest", "new", "newest",
            "available", "availability",
            "price", "cost", "budget", "range",
            "under", "below", "above", "between",
            "near", "around", "approx",
            "with", "without",
            "please", "plz", "kindly",
            "suggest", "recommend", "recommendation",
            "like", "similar", "something",

            // number words
            "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
            "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
            "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",

            // common short forms
            "k", "rs", "rupees", "inr"
        ]);

        return query.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/)
        .filter((word)=> !stopWords.has(word)).map((word)=> `%${word}%`)
    }