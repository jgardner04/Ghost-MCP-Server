import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDotenv } from '../../__tests__/helpers/testUtils.js';
import { createMockContextLogger } from '../../__tests__/helpers/mockLogger.js';

// Mock dotenv
vi.mock('dotenv', () => mockDotenv());

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  createContextLogger: createMockContextLogger(),
}));

// Mock ghostServiceImproved functions
vi.mock('../ghostServiceImproved.js', () => ({
  createNewsletter: vi.fn(),
}));

// Import after mocks are set up
import { createNewsletterService } from '../newsletterService.js';
import { createNewsletter } from '../ghostServiceImproved.js';

describe('newsletterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNewsletterService - validation', () => {
    it('should accept valid input and create a newsletter', async () => {
      const validInput = {
        name: 'Weekly Newsletter',
      };
      const expectedNewsletter = { id: '1', name: 'Weekly Newsletter', slug: 'weekly-newsletter' };
      createNewsletter.mockResolvedValue(expectedNewsletter);

      const result = await createNewsletterService(validInput);

      expect(result).toEqual(expectedNewsletter);
      expect(createNewsletter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Weekly Newsletter',
        })
      );
    });

    it('should reject input with missing name', async () => {
      const invalidInput = {};

      await expect(createNewsletterService(invalidInput)).rejects.toThrow(
        'Invalid newsletter input: "name" is required'
      );
      expect(createNewsletter).not.toHaveBeenCalled();
    });

    it('should accept all optional fields', async () => {
      const fullInput = {
        name: 'Monthly Newsletter',
        description: 'Our monthly updates',
        sender_name: 'John Doe',
        sender_email: 'john@example.com',
        sender_reply_to: 'newsletter',
        subscribe_on_signup: true,
        show_header_icon: true,
        show_header_title: false,
      };
      const expectedNewsletter = { id: '1', ...fullInput };
      createNewsletter.mockResolvedValue(expectedNewsletter);

      const result = await createNewsletterService(fullInput);

      expect(result).toEqual(expectedNewsletter);
      expect(createNewsletter).toHaveBeenCalledWith(expect.objectContaining(fullInput));
    });

    it('should validate sender_email is a valid email', async () => {
      const invalidInput = {
        name: 'Newsletter',
        sender_email: 'not-an-email',
      };

      await expect(createNewsletterService(invalidInput)).rejects.toThrow(
        'Invalid newsletter input:'
      );
      expect(createNewsletter).not.toHaveBeenCalled();
    });

    it('should accept valid sender_email', async () => {
      const validInput = {
        name: 'Newsletter',
        sender_email: 'valid@example.com',
      };
      createNewsletter.mockResolvedValue({ id: '1', name: 'Newsletter' });

      await createNewsletterService(validInput);

      expect(createNewsletter).toHaveBeenCalledWith(
        expect.objectContaining({
          sender_email: 'valid@example.com',
        })
      );
    });

    it('should validate sender_reply_to enum values', async () => {
      const invalidInput = {
        name: 'Newsletter',
        sender_reply_to: 'invalid',
      };

      await expect(createNewsletterService(invalidInput)).rejects.toThrow(
        'Invalid newsletter input:'
      );
      expect(createNewsletter).not.toHaveBeenCalled();
    });

    it('should accept valid sender_reply_to values', async () => {
      const validValues = ['newsletter', 'support'];
      createNewsletter.mockResolvedValue({ id: '1', name: 'Newsletter' });

      for (const value of validValues) {
        const input = {
          name: 'Newsletter',
          sender_reply_to: value,
        };

        await createNewsletterService(input);

        expect(createNewsletter).toHaveBeenCalledWith(
          expect.objectContaining({ sender_reply_to: value })
        );
        vi.clearAllMocks();
      }
    });

    it('should validate subscribe_on_signup is boolean', async () => {
      const invalidInput = {
        name: 'Newsletter',
        subscribe_on_signup: 'yes',
      };

      await expect(createNewsletterService(invalidInput)).rejects.toThrow(
        'Invalid newsletter input:'
      );
      expect(createNewsletter).not.toHaveBeenCalled();
    });

    it('should validate show_header_icon is boolean', async () => {
      const invalidInput = {
        name: 'Newsletter',
        show_header_icon: 'true',
      };

      await expect(createNewsletterService(invalidInput)).rejects.toThrow(
        'Invalid newsletter input:'
      );
      expect(createNewsletter).not.toHaveBeenCalled();
    });

    it('should validate show_header_title is boolean', async () => {
      const invalidInput = {
        name: 'Newsletter',
        show_header_title: 1,
      };

      await expect(createNewsletterService(invalidInput)).rejects.toThrow(
        'Invalid newsletter input:'
      );
      expect(createNewsletter).not.toHaveBeenCalled();
    });
  });

  describe('createNewsletterService - defaults and transformations', () => {
    beforeEach(() => {
      createNewsletter.mockResolvedValue({ id: '1', name: 'Newsletter' });
    });

    it('should pass through all provided fields', async () => {
      const input = {
        name: 'Newsletter',
        description: 'Test description',
        sender_name: 'Sender',
        sender_email: 'sender@example.com',
        sender_reply_to: 'support',
        subscribe_on_signup: false,
        show_header_icon: false,
        show_header_title: true,
      };

      await createNewsletterService(input);

      expect(createNewsletter).toHaveBeenCalledWith(expect.objectContaining(input));
    });

    it('should handle minimal input', async () => {
      const input = {
        name: 'Simple Newsletter',
      };

      await createNewsletterService(input);

      expect(createNewsletter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Simple Newsletter',
        })
      );
    });
  });

  describe('createNewsletterService - error handling', () => {
    it('should propagate errors from ghostServiceImproved', async () => {
      const input = {
        name: 'Newsletter',
      };
      createNewsletter.mockRejectedValue(new Error('Ghost API error'));

      await expect(createNewsletterService(input)).rejects.toThrow('Ghost API error');
    });
  });
});
