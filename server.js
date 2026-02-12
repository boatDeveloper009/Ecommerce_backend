import "./data.js"

import { app } from "./app.js";
import {v2 as cloudinary} from "cloudinary"

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLIENT_NAME,
    api_key: process.env.CLOUDINARY_CLIENT_API,
    api_secret: process.env.CLOUDINARY_CLIENT_SECRET
})

// server.js
app.listen(process.env.PORT, "0.0.0.0", async () => {
    console.log(`server is running at port ${PORT}`);
    
    // Run this AFTER the server is live
    try {
        const { createTables } = await import("./utils/createTables.js");
        await createTables();
        console.log("✅ Tables initialized");
    } catch (err) {
        console.error("❌ Table initialization failed", err);
    }
});