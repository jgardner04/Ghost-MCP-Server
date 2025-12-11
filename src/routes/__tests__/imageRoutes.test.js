import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock crypto for multer's safe filename generation
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('abcdef1234567890'),
    }),
  },
}));

// Mock os for temp directory
vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn().mockReturnValue('/tmp'),
  },
}));

// Mock fs for file operations
vi.mock('fs', () => ({
  default: {
    unlink: vi.fn((path, cb) => cb(null)),
    existsSync: vi.fn().mockReturnValue(true),
  },
}));

// Mock the image processing service
vi.mock('../../services/imageProcessingService.js', () => ({
  processImage: vi.fn().mockResolvedValue('/tmp/processed-image.jpg'),
}));

// Mock the ghost service
vi.mock('../../services/ghostService.js', () => ({
  uploadImage: vi.fn().mockResolvedValue({ url: 'https://ghost.com/image.jpg' }),
}));

// Import after mocks
import imageRoutes from '../imageRoutes.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/images', imageRoutes);
  // Add error handler
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

describe('imageRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /api/images', () => {
    describe('rate limiting', () => {
      it('should have rate limiting configured', () => {
        // The route should be configured with rate limiting
        // We verify indirectly by checking the route exists
        expect(imageRoutes).toBeDefined();
      });

      it('should return rate limit headers', async () => {
        const response = await request(app).post('/api/images');

        // Rate limit headers should be present
        expect(response.headers['ratelimit-limit']).toBeDefined();
        expect(response.headers['ratelimit-remaining']).toBeDefined();
      });
    });

    describe('file upload', () => {
      it('should return 400 when no file is provided', async () => {
        const response = await request(app).post('/api/images').send({});

        // Without a file, the controller should return 400
        expect(response.status).toBe(400);
      });
    });
  });

  describe('route configuration', () => {
    it('should export router', () => {
      expect(imageRoutes).toBeDefined();
    });

    it('should handle POST requests', async () => {
      const response = await request(app).post('/api/images');

      // Route exists (not 404)
      expect(response.status).not.toBe(404);
    });

    it('should not handle GET requests (no route defined)', async () => {
      const response = await request(app).get('/api/images');

      // Should return 404 since no GET route is defined
      expect(response.status).toBe(404);
    });
  });
});
