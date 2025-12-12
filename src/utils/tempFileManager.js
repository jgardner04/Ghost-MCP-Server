/**
 * Temp File Manager
 *
 * Provides robust temp file tracking and cleanup with:
 * - Async cleanup using fs.promises.unlink with await
 * - Parallel cleanup using Promise.allSettled
 * - Process exit handlers for orphaned file cleanup
 */
import fs from 'fs';
import fsPromises from 'fs/promises';

// Global Set to track temp files for cleanup
const tempFilesToCleanup = new Set();

/**
 * Track a temp file for cleanup
 * @param {string|null|undefined} filePath - Path to track
 */
export const trackTempFile = (filePath) => {
  if (filePath) {
    tempFilesToCleanup.add(filePath);
  }
};

/**
 * Untrack a temp file (remove from cleanup tracking)
 * @param {string|null|undefined} filePath - Path to untrack
 */
export const untrackTempFile = (filePath) => {
  if (filePath) {
    tempFilesToCleanup.delete(filePath);
  }
};

/**
 * Clean up a single temp file asynchronously
 * @param {string|null|undefined} filePath - Path to delete
 * @param {object} logger - Logger with warn method (default: console)
 * @returns {Promise<void>}
 */
export const cleanupTempFile = async (filePath, logger = console) => {
  if (!filePath) return;

  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    // ENOENT means file already deleted - not an error
    if (err.code !== 'ENOENT') {
      logger.warn?.('Failed to delete temp file', { file: filePath, error: err.message });
    }
  }
  // Always untrack, even on error
  untrackTempFile(filePath);
};

/**
 * Clean up multiple temp files in parallel
 * @param {Array<string|null|undefined>} filePaths - Paths to delete
 * @param {object} logger - Logger with warn method (default: console)
 * @returns {Promise<void>}
 */
export const cleanupTempFiles = async (filePaths, logger = console) => {
  // Filter out falsy values and deduplicate
  const uniquePaths = [...new Set(filePaths.filter(Boolean))];

  if (uniquePaths.length === 0) return;

  // Use Promise.allSettled to ensure all cleanups attempt even if some fail
  await Promise.allSettled(uniquePaths.map((p) => cleanupTempFile(p, logger)));
};

/**
 * Synchronously clean up all currently tracked files
 * Used for process exit handlers where async is not possible
 */
export const cleanupAllTrackedFilesSync = () => {
  for (const file of tempFilesToCleanup) {
    try {
      fs.unlinkSync(file);
    } catch (_) {
      // Ignore errors during exit cleanup
    }
  }
  tempFilesToCleanup.clear();
};

/**
 * Get a copy of currently tracked files (for testing)
 * @returns {Set<string>}
 */
export const getTrackedFiles = () => new Set(tempFilesToCleanup);

/**
 * Clear all tracking (for testing)
 */
export const clearTracking = () => {
  tempFilesToCleanup.clear();
};

// Register process exit handlers
// 'exit' event fires synchronously, so we must use sync cleanup
process.on('exit', cleanupAllTrackedFilesSync);

// SIGINT (Ctrl+C) and SIGTERM need to call process.exit to trigger the 'exit' handler
process.on('SIGINT', () => {
  cleanupAllTrackedFilesSync();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupAllTrackedFilesSync();
  process.exit(0);
});
