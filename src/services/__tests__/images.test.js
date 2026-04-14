import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockGhostApiModule } from '../../__tests__/helpers/mockGhostApi.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

vi.mock('@tryghost/admin-api', () => mockGhostApiModule());
vi.mock('dotenv', () => mockDotenv());
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Stub path validation so these tests focus on argument shaping, not FS.
vi.mock('../validators.js', () => ({
  validators: { validateImagePath: vi.fn().mockResolvedValue(undefined) },
}));

import { uploadImage } from '../images.js';
import { api } from '../ghostApiClient.js';
import { ValidationError } from '../../errors/index.js';

describe('images.uploadImage (domain module used by MCP server)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards purpose and ref to the SDK', async () => {
    const expected = { url: 'https://cdn/x.png', ref: 'original.png' };
    api.images.upload.mockResolvedValue(expected);

    const result = await uploadImage('/tmp/x.png', {
      purpose: 'icon',
      ref: 'original.png',
    });

    expect(result).toEqual(expected);
    expect(api.images.upload).toHaveBeenCalledWith({
      file: '/tmp/x.png',
      purpose: 'icon',
      ref: 'original.png',
    });
  });

  it('omits purpose/ref when not provided', async () => {
    api.images.upload.mockResolvedValue({ url: 'https://cdn/x.png' });
    await uploadImage('/tmp/x.png');
    expect(api.images.upload).toHaveBeenCalledWith({ file: '/tmp/x.png' });
  });

  it('accepts each allowed purpose value', async () => {
    api.images.upload.mockResolvedValue({ url: 'https://cdn/x' });
    for (const purpose of ['image', 'profile_image', 'icon']) {
      await uploadImage('/tmp/x.png', { purpose });
    }
    expect(api.images.upload).toHaveBeenCalledTimes(3);
  });

  it('rejects unknown purpose', async () => {
    await expect(uploadImage('/tmp/x.png', { purpose: 'banner' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(api.images.upload).not.toHaveBeenCalled();
  });

  it('rejects non-string ref', async () => {
    await expect(uploadImage('/tmp/x.png', { ref: 42 })).rejects.toThrow(/must be a string/);
  });

  it('rejects ref longer than 200 chars', async () => {
    await expect(uploadImage('/tmp/x.png', { ref: 'x'.repeat(201) })).rejects.toThrow(
      /cannot exceed 200/
    );
  });

  it('accepts ref of exactly 200 chars', async () => {
    api.images.upload.mockResolvedValue({ url: 'https://cdn/x' });
    await expect(uploadImage('/tmp/x.png', { ref: 'x'.repeat(200) })).resolves.toBeDefined();
  });
});
