import pkg from "pg";
const { Pool } = pkg;

const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

database.on("connect", () => {
  console.log("Database connected successfully (Pool)");
});

database.on("error", (err) => {
  console.error("Unexpected DB error", err);
});

export default database;
