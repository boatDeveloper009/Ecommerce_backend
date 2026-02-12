import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local env file ONLY if it exists
config({
  path: path.join(__dirname, ".env"),
});
