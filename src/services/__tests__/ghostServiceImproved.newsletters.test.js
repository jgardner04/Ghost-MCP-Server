import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { mockGhostApiModule } from '../../__tests__/helpers/mockGhostApi.js';

// Mock the Ghost Admin API using shared mock factory
vi.mock('@tryghost/admin-api', () => mockGhostApiModule());

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock fs for validateImagePath
vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  api,
} from '../ghostServiceImproved.js';
import { ValidationError, NotFoundError } from '../../errors/index.js';

describe('ghostServiceImproved - Newsletter Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNewsletters', () => {
    it('should retrieve all newsletters', async () => {
      const mockNewsletters = [
        { id: '1', name: 'Newsletter 1', slug: 'newsletter-1' },
        { id: '2', name: 'Newsletter 2', slug: 'newsletter-2' },
      ];
      api.newsletters.browse.mockResolvedValue(mockNewsletters);

      const result = await getNewsletters();

      expect(result).toEqual(mockNewsletters);
      expect(api.newsletters.browse).toHaveBeenCalledWith({ limit: 'all' }, {});
    });

    it('should support custom limit', async () => {
      const mockNewsletters = [{ id: '1', name: 'Newsletter 1' }];
      api.newsletters.browse.mockResolvedValue(mockNewsletters);

      await getNewsletters({ limit: 5 });

      expect(api.newsletters.browse).toHaveBeenCalledWith({ limit: 5 }, {});
    });

    it('should support filter option', async () => {
      const mockNewsletters = [{ id: '1', name: 'Active Newsletter' }];
      api.newsletters.browse.mockResolvedValue(mockNewsletters);

      await getNewsletters({ filter: 'status:active' });

      expect(api.newsletters.browse).toHaveBeenCalledWith(
        { limit: 'all', filter: 'status:active' },
        {}
      );
    });

    it('should handle empty results', async () => {
      api.newsletters.browse.mockResolvedValue([]);

      const result = await getNewsletters();

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      api.newsletters.browse.mockRejectedValue(new Error('API Error'));

      await expect(getNewsletters()).rejects.toThrow();
    });
  });

  describe('getNewsletter', () => {
    it('should retrieve a newsletter by ID', async () => {
      const mockNewsletter = { id: 'newsletter-123', name: 'My Newsletter' };
      api.newsletters.read.mockResolvedValue(mockNewsletter);

      const result = await getNewsletter('newsletter-123');

      expect(result).toEqual(mockNewsletter);
      expect(api.newsletters.read).toHaveBeenCalledWith({}, { id: 'newsletter-123' });
    });

    it('should throw ValidationError if ID is missing', async () => {
      await expect(getNewsletter()).rejects.toThrow(ValidationError);
      await expect(getNewsletter()).rejects.toThrow('Newsletter ID is required');
      expect(api.newsletters.read).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when newsletter does not exist', async () => {
      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      api.newsletters.read.mockRejectedValue(ghostError);

      await expect(getNewsletter('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('createNewsletter', () => {
    it('should create a newsletter with valid data', async () => {
      const newsletterData = {
        name: 'Weekly Newsletter',
        description: 'Our weekly updates',
      };
      const createdNewsletter = { id: '1', ...newsletterData };
      api.newsletters.add.mockResolvedValue(createdNewsletter);

      const result = await createNewsletter(newsletterData);

      expect(result).toEqual(createdNewsletter);
      expect(api.newsletters.add).toHaveBeenCalledWith(newsletterData, {});
    });

    it('should create newsletter with sender email', async () => {
      const newsletterData = {
        name: 'Newsletter',
        sender_name: 'John Doe',
        sender_email: 'john@example.com',
        sender_reply_to: 'newsletter',
      };
      const createdNewsletter = { id: '1', ...newsletterData };
      api.newsletters.add.mockResolvedValue(createdNewsletter);

      const result = await createNewsletter(newsletterData);

      expect(result).toEqual(createdNewsletter);
      expect(api.newsletters.add).toHaveBeenCalledWith(newsletterData, {});
    });

    it('should create newsletter with display options', async () => {
      const newsletterData = {
        name: 'Newsletter',
        subscribe_on_signup: true,
        show_header_icon: true,
        show_header_title: false,
      };
      const createdNewsletter = { id: '1', ...newsletterData };
      api.newsletters.add.mockResolvedValue(createdNewsletter);

      const result = await createNewsletter(newsletterData);

      expect(result).toEqual(createdNewsletter);
      expect(api.newsletters.add).toHaveBeenCalledWith(newsletterData, {});
    });

    it('should throw ValidationError if name is missing', async () => {
      const invalidData = { description: 'No name' };

      await expect(createNewsletter(invalidData)).rejects.toThrow(ValidationError);
      await expect(createNewsletter(invalidData)).rejects.toThrow('Newsletter validation failed');
      expect(api.newsletters.add).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if name is empty', async () => {
      const invalidData = { name: '' };

      await expect(createNewsletter(invalidData)).rejects.toThrow(ValidationError);
      await expect(createNewsletter(invalidData)).rejects.toThrow('Newsletter validation failed');
      expect(api.newsletters.add).not.toHaveBeenCalled();
    });

    it('should handle Ghost API validation errors', async () => {
      const newsletterData = { name: 'Newsletter' };
      const ghostError = new Error('Validation failed');
      ghostError.response = { status: 422 };
      api.newsletters.add.mockRejectedValue(ghostError);

      await expect(createNewsletter(newsletterData)).rejects.toThrow();
    });
  });

  describe('updateNewsletter', () => {
    it('should send only update fields and updated_at, not the full existing newsletter', async () => {
      const existingNewsletter = {
        id: 'newsletter-123',
        uuid: 'abc-def-123',
        name: 'Old Name',
        slug: 'old-name',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      const updateData = { name: 'New Name' };
      const updatedNewsletter = { ...existingNewsletter, ...updateData };

      api.newsletters.read.mockResolvedValue(existingNewsletter);
      api.newsletters.edit.mockResolvedValue(updatedNewsletter);

      const result = await updateNewsletter('newsletter-123', updateData);

      expect(result).toEqual(updatedNewsletter);
      expect(api.newsletters.read).toHaveBeenCalledWith({}, { id: 'newsletter-123' });
      // Should send ONLY updateData + updated_at, NOT the full existing newsletter
      expect(api.newsletters.edit).toHaveBeenCalledWith(
        { id: 'newsletter-123', name: 'New Name', updated_at: '2024-01-01T00:00:00.000Z' },
        {}
      );
      // Verify read-only fields are NOT sent
      const editCallData = api.newsletters.edit.mock.calls[0][0];
      expect(editCallData).not.toHaveProperty('uuid');
      expect(editCallData).not.toHaveProperty('slug');
    });

    it('should update newsletter with email settings', async () => {
      const existingNewsletter = {
        id: 'newsletter-123',
        name: 'Newsletter',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      const updateData = {
        sender_name: 'Updated Sender',
        sender_email: 'updated@example.com',
        subscribe_on_signup: false,
      };

      api.newsletters.read.mockResolvedValue(existingNewsletter);
      api.newsletters.edit.mockResolvedValue({ ...existingNewsletter, ...updateData });

      await updateNewsletter('newsletter-123', updateData);

      // Should send ONLY updateData + updated_at
      expect(api.newsletters.edit).toHaveBeenCalledWith(
        { id: 'newsletter-123', ...updateData, updated_at: '2024-01-01T00:00:00.000Z' },
        {}
      );
    });

    it('should throw ValidationError if ID is missing', async () => {
      await expect(updateNewsletter()).rejects.toThrow(ValidationError);
      await expect(updateNewsletter()).rejects.toThrow('Newsletter ID is required for update');
      expect(api.newsletters.read).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if newsletter does not exist', async () => {
      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      api.newsletters.read.mockRejectedValue(ghostError);

      await expect(updateNewsletter('nonexistent', { name: 'New Name' })).rejects.toThrow(
        NotFoundError
      );
    });

    it('should preserve updated_at from existing newsletter', async () => {
      const existingNewsletter = {
        id: 'newsletter-123',
        name: 'Newsletter',
        updated_at: '2024-01-01T00:00:00.000Z',
      };
      const updateData = { description: 'Updated description' };

      api.newsletters.read.mockResolvedValue(existingNewsletter);
      api.newsletters.edit.mockResolvedValue({ ...existingNewsletter, ...updateData });

      await updateNewsletter('newsletter-123', updateData);

      // Should send ONLY updateData + updated_at
      expect(api.newsletters.edit).toHaveBeenCalledWith(
        {
          id: 'newsletter-123',
          description: 'Updated description',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {}
      );
    });
  });

  describe('deleteNewsletter', () => {
    it('should delete a newsletter successfully', async () => {
      api.newsletters.delete.mockResolvedValue({ id: 'newsletter-123' });

      const result = await deleteNewsletter('newsletter-123');

      expect(result).toEqual({ id: 'newsletter-123' });
      expect(api.newsletters.delete).toHaveBeenCalledWith('newsletter-123', {});
    });

    it('should throw ValidationError if ID is missing', async () => {
      await expect(deleteNewsletter()).rejects.toThrow(ValidationError);
      await expect(deleteNewsletter()).rejects.toThrow('Newsletter ID is required for deletion');
      expect(api.newsletters.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if newsletter does not exist', async () => {
      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      api.newsletters.delete.mockRejectedValue(ghostError);

      await expect(deleteNewsletter('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });
});
