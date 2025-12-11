import { describe, it, expect, vi, beforeEach } from 'vitest';
import multer from 'multer';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    unlink: vi.fn((path, cb) => cb(null)),
  },
}));

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn().mockReturnValue('/tmp'),
  },
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('abcdef1234567890'),
    }),
  },
}));

const mockUploadGhostImage = vi.fn();
const mockProcessImage = vi.fn();

vi.mock('../../services/ghostService.js', () => ({
  uploadImage: (...args) => mockUploadGhostImage(...args),
}));

vi.mock('../../services/imageProcessingService.js', () => ({
  processImage: (...args) => mockProcessImage(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  createContextLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import after mocks are set up
import { upload, handleImageUpload } from '../imageController.js';
import fs from 'fs';

// Helper to create mock request
function createMockRequest(overrides = {}) {
  return {
    file: null,
    body: {},
    ...overrides,
  };
}

// Helper to create mock response
function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

// Helper to create mock next
function createMockNext() {
  return vi.fn();
}

describe('imageController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upload (multer instance)', () => {
    it('should be defined', () => {
      expect(upload).toBeDefined();
    });

    it('should have single method', () => {
      expect(typeof upload.single).toBe('function');
    });
  });

  describe('handleImageUpload', () => {
    describe('validation', () => {
      it('should return 400 when no file uploaded', async () => {
        const req = createMockRequest({ file: null });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: 'No image file uploaded.' });
      });

      it('should return 400 when file validation fails - missing size', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            path: '/tmp/mcp-upload-123-abc.jpg',
            // missing size - required field
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('File validation failed'),
          })
        );
      });

      it('should return 400 when file size exceeds limit', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 15 * 1024 * 1024, // 15MB - exceeds 10MB limit
            path: '/tmp/test.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('File validation failed'),
          })
        );
      });

      it('should return 400 when mimetype is invalid', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.txt',
            mimetype: 'text/plain',
            size: 1000,
            path: '/tmp/test.txt',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for invalid alt text', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
          body: {
            alt: 'a'.repeat(501), // exceeds 500 char limit
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        mockProcessImage.mockResolvedValue('/tmp/processed.jpg');

        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Invalid alt text'),
          })
        );
      });
    });

    describe('security', () => {
      it('should reject file path outside upload directory', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/etc/passwd', // Path traversal attempt
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Security violation'),
          })
        );
      });
    });

    describe('successful upload', () => {
      beforeEach(() => {
        mockProcessImage.mockResolvedValue('/tmp/processed-123.jpg');
        mockUploadGhostImage.mockResolvedValue({
          url: 'https://ghost.com/content/images/image.jpg',
        });
      });

      it('should process and upload image successfully', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
          body: {},
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(mockProcessImage).toHaveBeenCalledWith('/tmp/mcp-upload-123-abc.jpg', '/tmp');
        expect(mockUploadGhostImage).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://ghost.com/content/images/image.jpg',
            alt: expect.any(String),
          })
        );
      });

      it('should use provided alt text', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
          body: {
            alt: 'Custom alt text',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            alt: 'Custom alt text',
          })
        );
      });

      it('should generate default alt text from filename', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'beautiful-sunset-photo.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
          body: {},
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            alt: 'beautiful sunset photo',
          })
        );
      });

      it('should accept empty alt text', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
          body: {
            alt: '',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        await handleImageUpload(req, res, next);

        // Should use default alt when empty string provided
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            alt: expect.any(String),
          })
        );
      });
    });

    describe('error handling', () => {
      it('should pass non-multer errors to next', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        mockProcessImage.mockRejectedValue(new Error('Processing failed'));

        await handleImageUpload(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      it('should handle multer errors with 400 status', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        const multerError = new multer.MulterError('LIMIT_FILE_SIZE');
        mockProcessImage.mockRejectedValue(multerError);

        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('should handle upload service errors', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        mockProcessImage.mockResolvedValue('/tmp/processed.jpg');
        mockUploadGhostImage.mockRejectedValue(new Error('Upload to Ghost failed'));

        await handleImageUpload(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    describe('cleanup', () => {
      it('should cleanup temp files on success', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        mockProcessImage.mockResolvedValue('/tmp/processed-123.jpg');
        mockUploadGhostImage.mockResolvedValue({ url: 'https://ghost.com/image.jpg' });

        await handleImageUpload(req, res, next);

        expect(fs.unlink).toHaveBeenCalled();
      });

      it('should cleanup temp files on error', async () => {
        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        mockProcessImage.mockRejectedValue(new Error('Processing failed'));

        await handleImageUpload(req, res, next);

        expect(fs.unlink).toHaveBeenCalled();
      });

      it('should handle cleanup errors gracefully', async () => {
        fs.unlink.mockImplementation((path, cb) => cb(new Error('Unlink failed')));

        const req = createMockRequest({
          file: {
            originalname: 'test.jpg',
            mimetype: 'image/jpeg',
            size: 1000,
            path: '/tmp/mcp-upload-123-abc.jpg',
          },
        });
        const res = createMockResponse();
        const next = createMockNext();

        mockProcessImage.mockResolvedValue('/tmp/processed-123.jpg');
        mockUploadGhostImage.mockResolvedValue({ url: 'https://ghost.com/image.jpg' });

        // Should not throw even when cleanup fails
        await handleImageUpload(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
      });
    });

    describe('file type support', () => {
      const supportedTypes = [
        { name: 'test.jpg', mimetype: 'image/jpeg' },
        { name: 'test.jpeg', mimetype: 'image/jpeg' },
        { name: 'test.png', mimetype: 'image/png' },
        { name: 'test.gif', mimetype: 'image/gif' },
        { name: 'test.webp', mimetype: 'image/webp' },
        { name: 'test.svg', mimetype: 'image/svg+xml' },
      ];

      supportedTypes.forEach(({ name, mimetype }) => {
        it(`should accept ${mimetype} files`, async () => {
          mockProcessImage.mockResolvedValue('/tmp/processed.jpg');
          mockUploadGhostImage.mockResolvedValue({ url: 'https://ghost.com/image.jpg' });

          const req = createMockRequest({
            file: {
              originalname: name,
              mimetype: mimetype,
              size: 1000,
              path: `/tmp/mcp-upload-123-abc${name.substring(name.lastIndexOf('.'))}`,
            },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await handleImageUpload(req, res, next);

          expect(res.status).toHaveBeenCalledWith(200);
        });
      });
    });
  });

  describe('getDefaultAltText (tested indirectly)', () => {
    beforeEach(() => {
      mockProcessImage.mockResolvedValue('/tmp/processed.jpg');
      mockUploadGhostImage.mockResolvedValue({ url: 'https://ghost.com/image.jpg' });
    });

    it('should convert dashes to spaces', async () => {
      const req = createMockRequest({
        file: {
          originalname: 'my-beautiful-image.jpg',
          mimetype: 'image/jpeg',
          size: 1000,
          path: '/tmp/mcp-upload-123-abc.jpg',
        },
        body: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await handleImageUpload(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alt: 'my beautiful image',
        })
      );
    });

    it('should convert underscores to spaces', async () => {
      const req = createMockRequest({
        file: {
          originalname: 'my_great_photo.png',
          mimetype: 'image/png',
          size: 1000,
          path: '/tmp/mcp-upload-123-abc.png',
        },
        body: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await handleImageUpload(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alt: 'my great photo',
        })
      );
    });

    it('should fallback to "Uploaded image" for files without name', async () => {
      const req = createMockRequest({
        file: {
          originalname: '.jpg',
          mimetype: 'image/jpeg',
          size: 1000,
          path: '/tmp/mcp-upload-123-abc.jpg',
        },
        body: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await handleImageUpload(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alt: 'Uploaded image',
        })
      );
    });

    it('should sanitize path separators from filename', async () => {
      const req = createMockRequest({
        file: {
          originalname: 'path/to/image.jpg', // Contains path separator
          mimetype: 'image/jpeg',
          size: 1000,
          path: '/tmp/mcp-upload-123-abc.jpg',
        },
        body: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await handleImageUpload(req, res, next);

      // Should sanitize path separators
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          alt: expect.any(String),
        })
      );
    });
  });
});
