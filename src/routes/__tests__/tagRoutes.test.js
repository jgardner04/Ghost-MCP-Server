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

const mockGetTags = vi.fn();
const mockCreateTag = vi.fn();
vi.mock('../../controllers/tagController.js', () => ({
  getTags: (req, res, next) => mockGetTags(req, res, next),
  createTag: (req, res, next) => mockCreateTag(req, res, next),
}));

// Import after mocks
import tagRoutes from '../tagRoutes.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tags', tagRoutes);
  return app;
}

describe('tagRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Default mock responses
    mockGetTags.mockImplementation((req, res) => {
      res.status(200).json([{ id: '1', name: 'Test Tag' }]);
    });
    mockCreateTag.mockImplementation((req, res) => {
      res.status(201).json({ id: '1', name: req.body.name });
    });
  });

  describe('GET /api/tags', () => {
    it('should call getTags controller', async () => {
      const response = await request(app).get('/api/tags');

      expect(response.status).toBe(200);
      expect(mockGetTags).toHaveBeenCalled();
    });

    it('should pass query parameters to controller', async () => {
      await request(app).get('/api/tags?name=Technology');

      expect(mockGetTags).toHaveBeenCalled();
      const reqArg = mockGetTags.mock.calls[0][0];
      expect(reqArg.query.name).toBe('Technology');
    });
  });

  describe('POST /api/tags', () => {
    describe('validation - name', () => {
      it('should return 400 when name is missing', async () => {
        const response = await request(app).post('/api/tags').send({ description: 'A tag' });

        expect(response.status).toBe(400);
        expect(response.body.errors).toBeDefined();
        expect(response.body.errors.some((e) => e.path === 'name')).toBe(true);
      });

      it('should return 400 when name is empty string', async () => {
        const response = await request(app).post('/api/tags').send({ name: '' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'name')).toBe(true);
      });
    });

    describe('validation - description', () => {
      it('should accept valid description', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', description: 'Technology articles' });

        expect(response.status).toBe(201);
      });

      it('should return 400 when description exceeds 500 characters', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', description: 'a'.repeat(501) });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'description')).toBe(true);
      });
    });

    describe('validation - slug', () => {
      it('should accept valid slug with lowercase letters', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', slug: 'technology' });

        expect(response.status).toBe(201);
      });

      it('should accept valid slug with numbers', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', slug: 'tech123' });

        expect(response.status).toBe(201);
      });

      it('should accept valid slug with hyphens', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech News', slug: 'tech-news' });

        expect(response.status).toBe(201);
      });

      it('should return 400 for slug with uppercase letters', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', slug: 'Technology' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'slug')).toBe(true);
      });

      it('should return 400 for slug with spaces', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', slug: 'tech news' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'slug')).toBe(true);
      });

      it('should return 400 for slug with underscores', async () => {
        const response = await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', slug: 'tech_news' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'slug')).toBe(true);
      });
    });

    describe('successful tag creation', () => {
      it('should call createTag controller when validation passes', async () => {
        const response = await request(app).post('/api/tags').send({ name: 'Technology' });

        expect(response.status).toBe(201);
        expect(mockCreateTag).toHaveBeenCalled();
      });

      it('should pass validated body to controller', async () => {
        await request(app)
          .post('/api/tags')
          .send({ name: 'Tech', slug: 'tech', description: 'Technical articles' });

        expect(mockCreateTag).toHaveBeenCalled();
        const reqArg = mockCreateTag.mock.calls[0][0];
        expect(reqArg.body.name).toBe('Tech');
        expect(reqArg.body.slug).toBe('tech');
        expect(reqArg.body.description).toBe('Technical articles');
      });
    });
  });
});
