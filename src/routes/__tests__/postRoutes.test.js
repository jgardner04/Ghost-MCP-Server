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

const mockCreatePost = vi.fn();
vi.mock('../../controllers/postController.js', () => ({
  createPost: (req, res, next) => mockCreatePost(req, res, next),
}));

// Import after mocks
import postRoutes from '../postRoutes.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/posts', postRoutes);
  return app;
}

describe('postRoutes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Default mock response
    mockCreatePost.mockImplementation((req, res) => {
      res.status(201).json({ id: '1', title: req.body.title });
    });
  });

  describe('POST /api/posts', () => {
    describe('validation - title', () => {
      it('should return 400 when title is missing', async () => {
        const response = await request(app).post('/api/posts').send({ html: '<p>Content</p>' });

        expect(response.status).toBe(400);
        expect(response.body.errors).toBeDefined();
        expect(response.body.errors.some((e) => e.path === 'title')).toBe(true);
      });

      it('should return 400 when title is empty string', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: '', html: '<p>Content</p>' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'title')).toBe(true);
      });

      it('should return 400 when title is not a string', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 123, html: '<p>Content</p>' });

        expect(response.status).toBe(400);
      });
    });

    describe('validation - html', () => {
      it('should return 400 when html is missing', async () => {
        const response = await request(app).post('/api/posts').send({ title: 'Test Post' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'html')).toBe(true);
      });

      it('should return 400 when html is empty string', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test Post', html: '' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'html')).toBe(true);
      });
    });

    describe('validation - status', () => {
      it('should accept valid status "draft"', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', status: 'draft' });

        expect(response.status).toBe(201);
      });

      it('should accept valid status "published"', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', status: 'published' });

        expect(response.status).toBe(201);
      });

      it('should accept valid status "scheduled"', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', status: 'scheduled' });

        expect(response.status).toBe(201);
      });

      it('should return 400 for invalid status', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', status: 'invalid' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'status')).toBe(true);
      });
    });

    describe('validation - published_at', () => {
      it('should accept valid ISO8601 date', async () => {
        const response = await request(app).post('/api/posts').send({
          title: 'Test',
          html: '<p>Content</p>',
          published_at: '2024-01-15T10:00:00Z',
        });

        expect(response.status).toBe(201);
      });

      it('should return 400 for invalid date format', async () => {
        const response = await request(app).post('/api/posts').send({
          title: 'Test',
          html: '<p>Content</p>',
          published_at: 'not-a-date',
        });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'published_at')).toBe(true);
      });
    });

    describe('validation - tags', () => {
      it('should accept valid tags array', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', tags: ['tech', 'news'] });

        expect(response.status).toBe(201);
      });

      it('should return 400 when tags is not an array', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', tags: 'tech' });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'tags')).toBe(true);
      });
    });

    describe('validation - feature_image', () => {
      it('should accept valid URL for feature_image', async () => {
        const response = await request(app).post('/api/posts').send({
          title: 'Test',
          html: '<p>Content</p>',
          feature_image: 'https://example.com/image.jpg',
        });

        expect(response.status).toBe(201);
      });

      it('should return 400 for invalid URL', async () => {
        const response = await request(app).post('/api/posts').send({
          title: 'Test',
          html: '<p>Content</p>',
          feature_image: 'not-a-url',
        });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'feature_image')).toBe(true);
      });
    });

    describe('validation - meta_title', () => {
      it('should accept valid meta_title', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({ title: 'Test', html: '<p>Content</p>', meta_title: 'SEO Title' });

        expect(response.status).toBe(201);
      });

      it('should return 400 when meta_title exceeds 300 characters', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({
            title: 'Test',
            html: '<p>Content</p>',
            meta_title: 'a'.repeat(301),
          });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'meta_title')).toBe(true);
      });
    });

    describe('validation - meta_description', () => {
      it('should accept valid meta_description', async () => {
        const response = await request(app).post('/api/posts').send({
          title: 'Test',
          html: '<p>Content</p>',
          meta_description: 'A brief description',
        });

        expect(response.status).toBe(201);
      });

      it('should return 400 when meta_description exceeds 500 characters', async () => {
        const response = await request(app)
          .post('/api/posts')
          .send({
            title: 'Test',
            html: '<p>Content</p>',
            meta_description: 'a'.repeat(501),
          });

        expect(response.status).toBe(400);
        expect(response.body.errors.some((e) => e.path === 'meta_description')).toBe(true);
      });
    });

    describe('successful post creation', () => {
      it('should call createPost controller when validation passes', async () => {
        const response = await request(app).post('/api/posts').send({
          title: 'Test Post',
          html: '<p>Content</p>',
        });

        expect(response.status).toBe(201);
        expect(mockCreatePost).toHaveBeenCalled();
      });

      it('should pass validated body to controller', async () => {
        await request(app).post('/api/posts').send({
          title: 'My Title',
          html: '<p>My Content</p>',
          status: 'draft',
        });

        expect(mockCreatePost).toHaveBeenCalled();
        const reqArg = mockCreatePost.mock.calls[0][0];
        expect(reqArg.body.title).toBe('My Title');
        expect(reqArg.body.html).toBe('<p>My Content</p>');
        expect(reqArg.body.status).toBe('draft');
      });
    });
  });
});
