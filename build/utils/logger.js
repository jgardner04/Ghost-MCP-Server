import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get log level from environment or default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV === 'development';

// Define custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
);

// Development format (more readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, metadata }) => {
    let metaString = '';
    if (metadata && Object.keys(metadata).length > 0) {
      metaString = ` ${JSON.stringify(metadata)}`;
    }
    return `${timestamp} [${level}] ${message}${metaString}`;
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: isDevelopment ? devFormat : logFormat,
  defaultMeta: { 
    service: 'ghost-mcp-server',
    pid: process.pid
  },
  transports: [
    // Console output
    new winston.transports.Console({
      level: isDevelopment ? 'debug' : 'info'
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.Console()
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.Console()
  ]
});

// Add file logging in production
if (!isDevelopment) {
  const logDir = path.join(__dirname, '../../logs');
  
  // Create logs directory if it doesn't exist
  import('fs').then(fs => {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  });
  
  // Add file transports for production
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    tailable: true
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    tailable: true
  }));
}

// Create helper functions for common logging patterns
const createContextLogger = (context) => {
  return {
    debug: (message, meta = {}) => logger.debug(message, { ...meta, context }),
    info: (message, meta = {}) => logger.info(message, { ...meta, context }),
    warn: (message, meta = {}) => logger.warn(message, { ...meta, context }),
    error: (message, meta = {}) => logger.error(message, { ...meta, context }),
    
    // Convenience methods for common patterns
    apiRequest: (method, url, meta = {}) => 
      logger.info(`${method} ${url}`, { ...meta, context, type: 'api_request' }),
    
    apiResponse: (method, url, status, meta = {}) =>
      logger.info(`${method} ${url} -> ${status}`, { ...meta, context, type: 'api_response' }),
    
    apiError: (method, url, error, meta = {}) =>
      logger.error(`${method} ${url} failed`, { 
        ...meta, 
        context, 
        type: 'api_error',
        error: error.message,
        stack: error.stack 
      }),
    
    toolExecution: (toolName, input, meta = {}) =>
      logger.info(`Executing tool: ${toolName}`, { 
        ...meta, 
        context, 
        type: 'tool_execution',
        tool: toolName,
        inputKeys: Object.keys(input || {})
      }),
    
    toolSuccess: (toolName, result, meta = {}) =>
      logger.info(`Tool ${toolName} completed successfully`, {
        ...meta,
        context,
        type: 'tool_success',
        tool: toolName,
        resultType: typeof result
      }),
    
    toolError: (toolName, error, meta = {}) =>
      logger.error(`Tool ${toolName} failed`, {
        ...meta,
        context,
        type: 'tool_error',
        tool: toolName,
        error: error.message,
        stack: error.stack
      }),
      
    fileOperation: (operation, filePath, meta = {}) =>
      logger.debug(`File operation: ${operation}`, {
        ...meta,
        context,
        type: 'file_operation',
        operation,
        file: path.basename(filePath)
      })
  };
};

export default logger;
export { createContextLogger };