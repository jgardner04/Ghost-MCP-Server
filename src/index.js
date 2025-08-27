import express from "express";
import helmet from "helmet";
import dotenv from "dotenv";
import postRoutes from "./routes/postRoutes.js"; // Import post routes
import imageRoutes from "./routes/imageRoutes.js"; // Import image routes
import tagRoutes from "./routes/tagRoutes.js"; // Import tag routes
import { startMCPServer } from "./mcp_server.js"; // Import MCP server start function
import { createContextLogger } from "./utils/logger.js";

// Load environment variables from .env file
dotenv.config();

// Initialize logger for main server
const logger = createContextLogger('main');

const app = express();
const restApiPort = process.env.PORT || 3000;
const mcpPort = process.env.MCP_PORT || 3001; // Allow configuring MCP port

// Apply security headers with Helmet (OWASP recommended)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}))

// Middleware to parse JSON bodies with size limits
app.use(express.json({ 
  limit: '1mb',
  strict: true,
  type: 'application/json'
}));
// Middleware to parse URL-encoded bodies with size limits
app.use(express.urlencoded({ 
  extended: true,
  limit: '1mb',
  parameterLimit: 100
}));

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
  const statusCode = err.statusCode || err.response?.status || 500;
  
  logger.error('Express error handler triggered', {
    error: err.message,
    statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    type: 'express_error'
  });
  
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
    logger.info('Express REST API server started', {
      port: restApiPort,
      url: `http://localhost:${restApiPort}`,
      type: 'server_start'
    });
  });

  // Start MCP server
  await startMCPServer(mcpPort);
};

startServers().catch((error) => {
  logger.error('Failed to start servers', {
    error: error.message,
    stack: error.stack,
    type: 'server_start_error'
  });
  process.exit(1);
});
