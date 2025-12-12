import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import fsPromises from 'fs/promises';

// Mock fs modules before importing the module under test
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    default: {
      ...actual,
      unlinkSync: vi.fn(),
    },
    unlinkSync: vi.fn(),
  };
});

vi.mock('fs/promises', () => ({
  default: {
    unlink: vi.fn(),
  },
  unlink: vi.fn(),
}));

// Import after mocking
import {
  trackTempFile,
  untrackTempFile,
  cleanupTempFile,
  cleanupTempFiles,
  cleanupAllTrackedFilesSync,
  getTrackedFiles,
  clearTracking,
} from '../tempFileManager.js';

describe('tempFileManager', () => {
  beforeEach(() => {
    // Clear tracking and reset mocks before each test
    clearTracking();
    vi.clearAllMocks();
  });

  describe('trackTempFile', () => {
    it('should add file path to tracking set', () => {
      trackTempFile('/tmp/test-file.jpg');

      const tracked = getTrackedFiles();
      expect(tracked.has('/tmp/test-file.jpg')).toBe(true);
    });

    it('should handle null gracefully', () => {
      expect(() => trackTempFile(null)).not.toThrow();
      expect(getTrackedFiles().size).toBe(0);
    });

    it('should handle undefined gracefully', () => {
      expect(() => trackTempFile(undefined)).not.toThrow();
      expect(getTrackedFiles().size).toBe(0);
    });

    it('should handle empty string gracefully', () => {
      expect(() => trackTempFile('')).not.toThrow();
      expect(getTrackedFiles().size).toBe(0);
    });

    it('should not add duplicate paths', () => {
      trackTempFile('/tmp/test-file.jpg');
      trackTempFile('/tmp/test-file.jpg');

      const tracked = getTrackedFiles();
      expect(tracked.size).toBe(1);
    });

    it('should track multiple different files', () => {
      trackTempFile('/tmp/file1.jpg');
      trackTempFile('/tmp/file2.jpg');
      trackTempFile('/tmp/file3.jpg');

      const tracked = getTrackedFiles();
      expect(tracked.size).toBe(3);
    });
  });

  describe('untrackTempFile', () => {
    it('should remove file path from tracking set', () => {
      trackTempFile('/tmp/test-file.jpg');
      untrackTempFile('/tmp/test-file.jpg');

      const tracked = getTrackedFiles();
      expect(tracked.has('/tmp/test-file.jpg')).toBe(false);
    });

    it('should handle non-existent paths gracefully', () => {
      expect(() => untrackTempFile('/tmp/non-existent.jpg')).not.toThrow();
    });

    it('should handle null gracefully', () => {
      expect(() => untrackTempFile(null)).not.toThrow();
    });

    it('should handle undefined gracefully', () => {
      expect(() => untrackTempFile(undefined)).not.toThrow();
    });
  });

  describe('cleanupTempFile', () => {
    it('should delete file and untrack it', async () => {
      fsPromises.unlink.mockResolvedValueOnce(undefined);
      trackTempFile('/tmp/test-file.jpg');

      await cleanupTempFile('/tmp/test-file.jpg');

      expect(fsPromises.unlink).toHaveBeenCalledWith('/tmp/test-file.jpg');
      expect(getTrackedFiles().has('/tmp/test-file.jpg')).toBe(false);
    });

    it('should resolve when file does not exist (ENOENT)', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fsPromises.unlink.mockRejectedValueOnce(error);

      await expect(cleanupTempFile('/tmp/non-existent.jpg')).resolves.toBeUndefined();
    });

    it('should not log warning for ENOENT errors', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fsPromises.unlink.mockRejectedValueOnce(error);
      const mockLogger = { warn: vi.fn() };

      await cleanupTempFile('/tmp/non-existent.jpg', mockLogger);

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log warning on other errors but still resolve', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fsPromises.unlink.mockRejectedValueOnce(error);
      const mockLogger = { warn: vi.fn() };

      await expect(cleanupTempFile('/tmp/test.jpg', mockLogger)).resolves.toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete temp file',
        expect.objectContaining({ file: '/tmp/test.jpg' })
      );
    });

    it('should handle null path', async () => {
      await expect(cleanupTempFile(null)).resolves.toBeUndefined();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it('should handle undefined path', async () => {
      await expect(cleanupTempFile(undefined)).resolves.toBeUndefined();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it('should handle empty string path', async () => {
      await expect(cleanupTempFile('')).resolves.toBeUndefined();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it('should untrack file even on error', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fsPromises.unlink.mockRejectedValueOnce(error);
      trackTempFile('/tmp/test.jpg');
      const mockLogger = { warn: vi.fn() };

      await cleanupTempFile('/tmp/test.jpg', mockLogger);

      expect(getTrackedFiles().has('/tmp/test.jpg')).toBe(false);
    });

    it('should work with default console logger', async () => {
      fsPromises.unlink.mockResolvedValueOnce(undefined);

      // Should not throw when using default logger
      await expect(cleanupTempFile('/tmp/test.jpg')).resolves.toBeUndefined();
    });
  });

  describe('cleanupTempFiles', () => {
    it('should clean up multiple files in parallel', async () => {
      fsPromises.unlink.mockResolvedValue(undefined);

      await cleanupTempFiles(['/tmp/file1.jpg', '/tmp/file2.jpg', '/tmp/file3.jpg']);

      expect(fsPromises.unlink).toHaveBeenCalledTimes(3);
      expect(fsPromises.unlink).toHaveBeenCalledWith('/tmp/file1.jpg');
      expect(fsPromises.unlink).toHaveBeenCalledWith('/tmp/file2.jpg');
      expect(fsPromises.unlink).toHaveBeenCalledWith('/tmp/file3.jpg');
    });

    it('should handle mixed success/failure scenarios', async () => {
      fsPromises.unlink
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(undefined);
      const mockLogger = { warn: vi.fn() };

      // Should resolve even with failures
      await expect(
        cleanupTempFiles(['/tmp/file1.jpg', '/tmp/file2.jpg', '/tmp/file3.jpg'], mockLogger)
      ).resolves.toBeUndefined();
    });

    it('should filter out null and undefined paths', async () => {
      fsPromises.unlink.mockResolvedValue(undefined);

      await cleanupTempFiles(['/tmp/file1.jpg', null, undefined, '/tmp/file2.jpg']);

      expect(fsPromises.unlink).toHaveBeenCalledTimes(2);
    });

    it('should filter out empty string paths', async () => {
      fsPromises.unlink.mockResolvedValue(undefined);

      await cleanupTempFiles(['/tmp/file1.jpg', '', '/tmp/file2.jpg']);

      expect(fsPromises.unlink).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate paths', async () => {
      fsPromises.unlink.mockResolvedValue(undefined);

      await cleanupTempFiles(['/tmp/file1.jpg', '/tmp/file1.jpg', '/tmp/file2.jpg']);

      expect(fsPromises.unlink).toHaveBeenCalledTimes(2);
    });

    it('should handle empty file list', async () => {
      await expect(cleanupTempFiles([])).resolves.toBeUndefined();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it('should handle list with only null/undefined', async () => {
      await expect(cleanupTempFiles([null, undefined, ''])).resolves.toBeUndefined();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('cleanupAllTrackedFilesSync', () => {
    it('should clean up all currently tracked files', () => {
      fs.unlinkSync.mockImplementation(() => {});
      trackTempFile('/tmp/file1.jpg');
      trackTempFile('/tmp/file2.jpg');

      cleanupAllTrackedFilesSync();

      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file1.jpg');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/file2.jpg');
    });

    it('should clear the tracking set after cleanup', () => {
      fs.unlinkSync.mockImplementation(() => {});
      trackTempFile('/tmp/file1.jpg');

      cleanupAllTrackedFilesSync();

      expect(getTrackedFiles().size).toBe(0);
    });

    it('should handle empty tracking set gracefully', () => {
      expect(() => cleanupAllTrackedFilesSync()).not.toThrow();
    });

    it('should continue cleanup even if one file fails', () => {
      fs.unlinkSync
        .mockImplementationOnce(() => {
          throw new Error('Failed');
        })
        .mockImplementationOnce(() => {});
      trackTempFile('/tmp/file1.jpg');
      trackTempFile('/tmp/file2.jpg');

      expect(() => cleanupAllTrackedFilesSync()).not.toThrow();
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should clear tracking set even on errors', () => {
      fs.unlinkSync.mockImplementation(() => {
        throw new Error('Failed');
      });
      trackTempFile('/tmp/file1.jpg');

      cleanupAllTrackedFilesSync();

      expect(getTrackedFiles().size).toBe(0);
    });
  });

  describe('getTrackedFiles', () => {
    it('should return a copy of the tracking set', () => {
      trackTempFile('/tmp/test.jpg');

      const tracked = getTrackedFiles();
      tracked.add('/tmp/hacked.jpg'); // Try to modify

      // Original set should not be affected
      expect(getTrackedFiles().has('/tmp/hacked.jpg')).toBe(false);
    });
  });

  describe('clearTracking', () => {
    it('should clear all tracked files', () => {
      trackTempFile('/tmp/file1.jpg');
      trackTempFile('/tmp/file2.jpg');

      clearTracking();

      expect(getTrackedFiles().size).toBe(0);
    });
  });
});
