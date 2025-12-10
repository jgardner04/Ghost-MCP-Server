import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock sharp with chainable API
const mockMetadata = vi.fn();
const mockResize = vi.fn();
const mockJpeg = vi.fn();
const mockToFile = vi.fn();

const createMockSharp = () => {
  const instance = {
    metadata: mockMetadata,
    resize: mockResize,
    jpeg: mockJpeg,
  };

  // Make methods chainable
  mockResize.mockReturnValue(instance);
  mockJpeg.mockReturnValue(instance);
  instance.toFile = mockToFile;

  return instance;
};

vi.mock('sharp', () => ({
  default: vi.fn(() => createMockSharp()),
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

// Mock path - use actual implementation but allow spying
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    default: actual.default,
    ...actual,
  };
});

// Import after mocks are set up
import { processImage } from '../imageProcessingService.js';
import sharp from 'sharp';
import fs from 'fs';

describe('imageProcessingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockMetadata.mockResolvedValue({ width: 800, size: 100000 });
    mockToFile.mockResolvedValue();
    fs.existsSync.mockReturnValue(true);
  });

  describe('Input Validation', () => {
    it('should accept valid inputPath and outputDir', async () => {
      const inputPath = '/tmp/test-image.jpg';
      const outputDir = '/tmp/output';

      await processImage(inputPath, outputDir);

      expect(sharp).toHaveBeenCalledWith(inputPath);
      expect(mockToFile).toHaveBeenCalled();
    });

    it('should reject missing inputPath', async () => {
      await expect(processImage(undefined, '/tmp/output')).rejects.toThrow(
        'Invalid processing parameters'
      );
      expect(sharp).not.toHaveBeenCalled();
    });

    it('should reject missing outputDir', async () => {
      await expect(processImage('/tmp/test.jpg', undefined)).rejects.toThrow(
        'Invalid processing parameters'
      );
      expect(sharp).not.toHaveBeenCalled();
    });
  });

  describe('Path Security', () => {
    it('should resolve paths correctly', async () => {
      const inputPath = './relative/path/image.jpg';
      const outputDir = './output';

      await processImage(inputPath, outputDir);

      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('image.jpg'));
      expect(mockToFile).toHaveBeenCalledWith(expect.stringContaining('output'));
    });

    it('should throw error when input file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      await expect(processImage('/tmp/nonexistent.jpg', '/tmp/output')).rejects.toThrow(
        'Input file does not exist'
      );
      expect(sharp).not.toHaveBeenCalled();
    });
  });

  describe('Image Processing', () => {
    it('should not resize image when width <= MAX_WIDTH (1200)', async () => {
      mockMetadata.mockResolvedValue({ width: 1000, size: 100000 });

      await processImage('/tmp/small-image.jpg', '/tmp/output');

      expect(mockResize).not.toHaveBeenCalled();
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 80 });
      expect(mockToFile).toHaveBeenCalled();
    });

    it('should resize image when width > MAX_WIDTH (1200)', async () => {
      mockMetadata.mockResolvedValue({ width: 2000, size: 200000 });

      await processImage('/tmp/large-image.jpg', '/tmp/output');

      expect(mockResize).toHaveBeenCalledWith({ width: 1200 });
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 80 });
      expect(mockToFile).toHaveBeenCalled();
    });

    it('should generate output filename with timestamp and processed prefix', async () => {
      const inputPath = '/tmp/test-photo.jpg';
      const outputDir = '/tmp/output';

      // Mock Date.now to get predictable filename
      const mockTimestamp = 1234567890;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      await processImage(inputPath, outputDir);

      expect(mockToFile).toHaveBeenCalledWith(
        expect.stringMatching(/processed-1234567890-test-photo\.jpg$/)
      );

      vi.restoreAllMocks();
    });

    it('should convert image to JPEG with quality setting of 80', async () => {
      await processImage('/tmp/image.png', '/tmp/output');

      expect(mockJpeg).toHaveBeenCalledWith({ quality: 80 });
      expect(mockToFile).toHaveBeenCalled();
    });

    it('should handle images with multiple dots in filename', async () => {
      const inputPath = '/tmp/my.test.image.png';
      const outputDir = '/tmp/output';
      const mockTimestamp = 9999999999;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      await processImage(inputPath, outputDir);

      expect(mockToFile).toHaveBeenCalledWith(
        expect.stringMatching(/processed-9999999999-my\.test\.image\.jpg$/)
      );

      vi.restoreAllMocks();
    });
  });

  describe('Error Handling', () => {
    it('should catch and re-throw sharp processing failures', async () => {
      const processingError = new Error('Sharp processing failed');
      mockMetadata.mockRejectedValue(processingError);

      await expect(processImage('/tmp/corrupt.jpg', '/tmp/output')).rejects.toThrow(
        'Image processing failed: Sharp processing failed'
      );
    });

    it('should include original error message in re-thrown error', async () => {
      const originalMessage = 'Input buffer contains unsupported image format';
      mockToFile.mockRejectedValue(new Error(originalMessage));

      await expect(processImage('/tmp/bad-format.dat', '/tmp/output')).rejects.toThrow(
        `Image processing failed: ${originalMessage}`
      );
    });

    it('should handle errors during JPEG conversion', async () => {
      const conversionError = new Error('JPEG conversion failed');
      mockToFile.mockRejectedValue(conversionError);

      await expect(processImage('/tmp/image.jpg', '/tmp/output')).rejects.toThrow(
        'Image processing failed: JPEG conversion failed'
      );
    });
  });
});
