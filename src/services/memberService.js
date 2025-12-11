import sanitizeHtml from 'sanitize-html';
import { ValidationError } from '../errors/index.js';

/**
 * Email validation regex
 * Simple but effective email validation
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Maximum length constants (following Ghost's database constraints)
 */
const MAX_NAME_LENGTH = 191; // Ghost's typical varchar limit
const MAX_NOTE_LENGTH = 2000; // Reasonable limit for notes
const MAX_LABEL_LENGTH = 191; // Label name limit

/**
 * Validates member data for creation
 * @param {Object} memberData - The member data to validate
 * @throws {ValidationError} If validation fails
 */
export function validateMemberData(memberData) {
  const errors = [];

  // Email is required and must be valid
  if (!memberData.email || memberData.email.trim().length === 0) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(memberData.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  // Name is optional but must be a string with valid length if provided
  if (memberData.name !== undefined) {
    if (typeof memberData.name !== 'string') {
      errors.push({ field: 'name', message: 'Name must be a string' });
    } else if (memberData.name.length > MAX_NAME_LENGTH) {
      errors.push({ field: 'name', message: `Name must not exceed ${MAX_NAME_LENGTH} characters` });
    }
  }

  // Note is optional but must be a string with valid length if provided
  // Sanitize HTML to prevent XSS attacks
  if (memberData.note !== undefined) {
    if (typeof memberData.note !== 'string') {
      errors.push({ field: 'note', message: 'Note must be a string' });
    } else {
      if (memberData.note.length > MAX_NOTE_LENGTH) {
        errors.push({
          field: 'note',
          message: `Note must not exceed ${MAX_NOTE_LENGTH} characters`,
        });
      }
      // Sanitize HTML content - strip all HTML tags for notes
      memberData.note = sanitizeHtml(memberData.note, {
        allowedTags: [], // Strip all HTML
        allowedAttributes: {},
      });
    }
  }

  // Labels is optional but must be an array of valid strings if provided
  if (memberData.labels !== undefined) {
    if (!Array.isArray(memberData.labels)) {
      errors.push({ field: 'labels', message: 'Labels must be an array' });
    } else {
      // Validate each label is a non-empty string within length limit
      const invalidLabels = memberData.labels.filter(
        (label) =>
          typeof label !== 'string' || label.trim().length === 0 || label.length > MAX_LABEL_LENGTH
      );
      if (invalidLabels.length > 0) {
        errors.push({
          field: 'labels',
          message: `Each label must be a non-empty string (max ${MAX_LABEL_LENGTH} characters)`,
        });
      }
    }
  }

  // Newsletters is optional but must be an array of objects with valid id field
  if (memberData.newsletters !== undefined) {
    if (!Array.isArray(memberData.newsletters)) {
      errors.push({ field: 'newsletters', message: 'Newsletters must be an array' });
    } else {
      // Validate each newsletter has a non-empty string id
      const invalidNewsletters = memberData.newsletters.filter(
        (newsletter) =>
          !newsletter.id || typeof newsletter.id !== 'string' || newsletter.id.trim().length === 0
      );
      if (invalidNewsletters.length > 0) {
        errors.push({
          field: 'newsletters',
          message: 'Each newsletter must have a non-empty id field',
        });
      }
    }
  }

  // Subscribed is optional but must be a boolean if provided
  if (memberData.subscribed !== undefined && typeof memberData.subscribed !== 'boolean') {
    errors.push({ field: 'subscribed', message: 'Subscribed must be a boolean' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Member validation failed', errors);
  }
}

/**
 * Validates member data for update
 * All fields are optional for updates, but if provided they must be valid
 * @param {Object} updateData - The member update data to validate
 * @throws {ValidationError} If validation fails
 */
export function validateMemberUpdateData(updateData) {
  const errors = [];

  // Email is optional for update but must be valid if provided
  if (updateData.email !== undefined) {
    if (typeof updateData.email !== 'string' || updateData.email.trim().length === 0) {
      errors.push({ field: 'email', message: 'Email must be a non-empty string' });
    } else if (!EMAIL_REGEX.test(updateData.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }
  }

  // Name is optional but must be a string with valid length if provided
  if (updateData.name !== undefined) {
    if (typeof updateData.name !== 'string') {
      errors.push({ field: 'name', message: 'Name must be a string' });
    } else if (updateData.name.length > MAX_NAME_LENGTH) {
      errors.push({ field: 'name', message: `Name must not exceed ${MAX_NAME_LENGTH} characters` });
    }
  }

  // Note is optional but must be a string with valid length if provided
  // Sanitize HTML to prevent XSS attacks
  if (updateData.note !== undefined) {
    if (typeof updateData.note !== 'string') {
      errors.push({ field: 'note', message: 'Note must be a string' });
    } else {
      if (updateData.note.length > MAX_NOTE_LENGTH) {
        errors.push({
          field: 'note',
          message: `Note must not exceed ${MAX_NOTE_LENGTH} characters`,
        });
      }
      // Sanitize HTML content - strip all HTML tags for notes
      updateData.note = sanitizeHtml(updateData.note, {
        allowedTags: [], // Strip all HTML
        allowedAttributes: {},
      });
    }
  }

  // Labels is optional but must be an array of valid strings if provided
  if (updateData.labels !== undefined) {
    if (!Array.isArray(updateData.labels)) {
      errors.push({ field: 'labels', message: 'Labels must be an array' });
    } else {
      // Validate each label is a non-empty string within length limit
      const invalidLabels = updateData.labels.filter(
        (label) =>
          typeof label !== 'string' || label.trim().length === 0 || label.length > MAX_LABEL_LENGTH
      );
      if (invalidLabels.length > 0) {
        errors.push({
          field: 'labels',
          message: `Each label must be a non-empty string (max ${MAX_LABEL_LENGTH} characters)`,
        });
      }
    }
  }

  // Newsletters is optional but must be an array of objects with valid id field
  if (updateData.newsletters !== undefined) {
    if (!Array.isArray(updateData.newsletters)) {
      errors.push({ field: 'newsletters', message: 'Newsletters must be an array' });
    } else {
      // Validate each newsletter has a non-empty string id
      const invalidNewsletters = updateData.newsletters.filter(
        (newsletter) =>
          !newsletter.id || typeof newsletter.id !== 'string' || newsletter.id.trim().length === 0
      );
      if (invalidNewsletters.length > 0) {
        errors.push({
          field: 'newsletters',
          message: 'Each newsletter must have a non-empty id field',
        });
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Member validation failed', errors);
  }
}

export default {
  validateMemberData,
  validateMemberUpdateData,
};
