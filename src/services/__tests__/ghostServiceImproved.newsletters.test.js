import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';

// Mock dotenv before other imports
vi.mock('dotenv', () => mockDotenv());

// Create a mock Ghost Admin API
vi.mock('@tryghost/admin-api', () => {
  const mockNewslettersApi = {
    browse: vi.fn(),
    read: vi.fn(),
    add: vi.fn(),
    edit: vi.fn(),
    delete: vi.fn(),
  };

  return {
    default: class {
      constructor() {
        return {
          newsletters: mockNewslettersApi,
        };
      }
    },
    mockNewslettersApi,
  };
});

// Import after mocks are set up
import {
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
} from '../ghostServiceImproved.js';
import { ValidationError, NotFoundError } from '../../errors/index.js';

// Get the mock API
const { mockNewslettersApi } = await vi.importMock('@tryghost/admin-api');

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
      mockNewslettersApi.browse.mockResolvedValue(mockNewsletters);

      const result = await getNewsletters();

      expect(result).toEqual(mockNewsletters);
      expect(mockNewslettersApi.browse).toHaveBeenCalledWith({ limit: 'all' }, {});
    });

    it('should support custom limit', async () => {
      const mockNewsletters = [{ id: '1', name: 'Newsletter 1' }];
      mockNewslettersApi.browse.mockResolvedValue(mockNewsletters);

      await getNewsletters({ limit: 5 });

      expect(mockNewslettersApi.browse).toHaveBeenCalledWith({ limit: 5 }, {});
    });

    it('should support filter option', async () => {
      const mockNewsletters = [{ id: '1', name: 'Active Newsletter' }];
      mockNewslettersApi.browse.mockResolvedValue(mockNewsletters);

      await getNewsletters({ filter: 'status:active' });

      expect(mockNewslettersApi.browse).toHaveBeenCalledWith(
        { limit: 'all', filter: 'status:active' },
        {}
      );
    });

    it('should handle empty results', async () => {
      mockNewslettersApi.browse.mockResolvedValue([]);

      const result = await getNewsletters();

      expect(result).toEqual([]);
    });

    it('should propagate API errors', async () => {
      mockNewslettersApi.browse.mockRejectedValue(new Error('API Error'));

      await expect(getNewsletters()).rejects.toThrow();
    });
  });

  describe('getNewsletter', () => {
    it('should retrieve a newsletter by ID', async () => {
      const mockNewsletter = { id: 'newsletter-123', name: 'My Newsletter' };
      mockNewslettersApi.read.mockResolvedValue(mockNewsletter);

      const result = await getNewsletter('newsletter-123');

      expect(result).toEqual(mockNewsletter);
      expect(mockNewslettersApi.read).toHaveBeenCalledWith({}, { id: 'newsletter-123' });
    });

    it('should throw ValidationError if ID is missing', async () => {
      await expect(getNewsletter()).rejects.toThrow(ValidationError);
      await expect(getNewsletter()).rejects.toThrow('Newsletter ID is required');
      expect(mockNewslettersApi.read).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when newsletter does not exist', async () => {
      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      mockNewslettersApi.read.mockRejectedValue(ghostError);

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
      mockNewslettersApi.add.mockResolvedValue(createdNewsletter);

      const result = await createNewsletter(newsletterData);

      expect(result).toEqual(createdNewsletter);
      expect(mockNewslettersApi.add).toHaveBeenCalledWith(newsletterData, {});
    });

    it('should create newsletter with sender email', async () => {
      const newsletterData = {
        name: 'Newsletter',
        sender_name: 'John Doe',
        sender_email: 'john@example.com',
        sender_reply_to: 'newsletter',
      };
      const createdNewsletter = { id: '1', ...newsletterData };
      mockNewslettersApi.add.mockResolvedValue(createdNewsletter);

      const result = await createNewsletter(newsletterData);

      expect(result).toEqual(createdNewsletter);
      expect(mockNewslettersApi.add).toHaveBeenCalledWith(newsletterData, {});
    });

    it('should create newsletter with display options', async () => {
      const newsletterData = {
        name: 'Newsletter',
        subscribe_on_signup: true,
        show_header_icon: true,
        show_header_title: false,
      };
      const createdNewsletter = { id: '1', ...newsletterData };
      mockNewslettersApi.add.mockResolvedValue(createdNewsletter);

      const result = await createNewsletter(newsletterData);

      expect(result).toEqual(createdNewsletter);
      expect(mockNewslettersApi.add).toHaveBeenCalledWith(newsletterData, {});
    });

    it('should throw ValidationError if name is missing', async () => {
      const invalidData = { description: 'No name' };

      await expect(createNewsletter(invalidData)).rejects.toThrow(ValidationError);
      await expect(createNewsletter(invalidData)).rejects.toThrow('Newsletter validation failed');
      expect(mockNewslettersApi.add).not.toHaveBeenCalled();
    });

    it('should throw ValidationError if name is empty', async () => {
      const invalidData = { name: '' };

      await expect(createNewsletter(invalidData)).rejects.toThrow(ValidationError);
      await expect(createNewsletter(invalidData)).rejects.toThrow('Newsletter validation failed');
      expect(mockNewslettersApi.add).not.toHaveBeenCalled();
    });

    it('should handle Ghost API validation errors', async () => {
      const newsletterData = { name: 'Newsletter' };
      const ghostError = new Error('Validation failed');
      ghostError.response = { status: 422 };
      mockNewslettersApi.add.mockRejectedValue(ghostError);

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

      mockNewslettersApi.read.mockResolvedValue(existingNewsletter);
      mockNewslettersApi.edit.mockResolvedValue(updatedNewsletter);

      const result = await updateNewsletter('newsletter-123', updateData);

      expect(result).toEqual(updatedNewsletter);
      expect(mockNewslettersApi.read).toHaveBeenCalledWith({}, { id: 'newsletter-123' });
      // Should send ONLY updateData + updated_at, NOT the full existing newsletter
      expect(mockNewslettersApi.edit).toHaveBeenCalledWith(
        { name: 'New Name', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'newsletter-123' }
      );
      // Verify read-only fields are NOT sent
      const editCallData = mockNewslettersApi.edit.mock.calls[0][0];
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

      mockNewslettersApi.read.mockResolvedValue(existingNewsletter);
      mockNewslettersApi.edit.mockResolvedValue({ ...existingNewsletter, ...updateData });

      await updateNewsletter('newsletter-123', updateData);

      // Should send ONLY updateData + updated_at
      expect(mockNewslettersApi.edit).toHaveBeenCalledWith(
        { ...updateData, updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'newsletter-123' }
      );
    });

    it('should throw ValidationError if ID is missing', async () => {
      await expect(updateNewsletter()).rejects.toThrow(ValidationError);
      await expect(updateNewsletter()).rejects.toThrow('Newsletter ID is required for update');
      expect(mockNewslettersApi.read).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if newsletter does not exist', async () => {
      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      mockNewslettersApi.read.mockRejectedValue(ghostError);

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

      mockNewslettersApi.read.mockResolvedValue(existingNewsletter);
      mockNewslettersApi.edit.mockResolvedValue({ ...existingNewsletter, ...updateData });

      await updateNewsletter('newsletter-123', updateData);

      // Should send ONLY updateData + updated_at
      expect(mockNewslettersApi.edit).toHaveBeenCalledWith(
        { description: 'Updated description', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 'newsletter-123' }
      );
    });
  });

  describe('deleteNewsletter', () => {
    it('should delete a newsletter successfully', async () => {
      mockNewslettersApi.delete.mockResolvedValue({ id: 'newsletter-123' });

      const result = await deleteNewsletter('newsletter-123');

      expect(result).toEqual({ id: 'newsletter-123' });
      expect(mockNewslettersApi.delete).toHaveBeenCalledWith('newsletter-123', {});
    });

    it('should throw ValidationError if ID is missing', async () => {
      await expect(deleteNewsletter()).rejects.toThrow(ValidationError);
      await expect(deleteNewsletter()).rejects.toThrow('Newsletter ID is required for deletion');
      expect(mockNewslettersApi.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if newsletter does not exist', async () => {
      const ghostError = new Error('Not found');
      ghostError.response = { status: 404 };
      mockNewslettersApi.delete.mockRejectedValue(ghostError);

      await expect(deleteNewsletter('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });
});
