import express from "express";
import dotenv from "dotenv";
import postRoutes from "./routes/postRoutes.js"; // Import post routes
import imageRoutes from "./routes/imageRoutes.js"; // Import image routes
import tagRoutes from "./routes/tagRoutes.js"; // Import tag routes
import { startMCPServer } from "./mcp_server.js"; // Import MCP server start function

// Load environment variables from .env file
dotenv.config();

const app = express();
const restApiPort = process.env.PORT || 3000;
const mcpPort = process.env.MCP_PORT || 3001; // Allow configuring MCP port

// Middleware to parse JSON bodies
app.use(express.json());
// Middleware to parse URL-encoded bodies (needed potentially for form fields with images)
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});

// Mount the post routes
app.use("/api/posts", postRoutes); // All post routes will be prefixed with /api/posts
// Mount the image routes
app.use("/api/images", imageRoutes);
// Mount the tag routes
app.use("/api/tags", tagRoutes);

// Global error handler for Express
app.use((err, req, res, next) => {
  console.error("[Express Error Handler]:", err.message);
  // Determine status code from error if possible, otherwise default to 500
  const statusCode = err.statusCode || err.response?.status || 500;
  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    // Optionally include stack trace in development
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Start both servers
const startServers = async () => {
  // Start Express server
  app.listen(restApiPort, () => {
    console.log(
      `🚀 Express REST API server listening at http://localhost:${restApiPort}`
    );
  });

  // Start MCP server
  await startMCPServer(mcpPort);
};

startServers().catch((error) => {
  console.error("Failed to start servers:", error);
  process.exit(1);
});
