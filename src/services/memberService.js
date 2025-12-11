import { ValidationError } from '../errors/index.js';

/**
 * Email validation regex
 * Simple but effective email validation
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // Name is optional but must be a string if provided
  if (memberData.name !== undefined && typeof memberData.name !== 'string') {
    errors.push({ field: 'name', message: 'Name must be a string' });
  }

  // Note is optional but must be a string if provided
  if (memberData.note !== undefined && typeof memberData.note !== 'string') {
    errors.push({ field: 'note', message: 'Note must be a string' });
  }

  // Labels is optional but must be an array if provided
  if (memberData.labels !== undefined && !Array.isArray(memberData.labels)) {
    errors.push({ field: 'labels', message: 'Labels must be an array' });
  }

  // Newsletters is optional but must be an array of objects with id field
  if (memberData.newsletters !== undefined) {
    if (!Array.isArray(memberData.newsletters)) {
      errors.push({ field: 'newsletters', message: 'Newsletters must be an array' });
    } else {
      // Validate each newsletter has an id
      const invalidNewsletters = memberData.newsletters.filter(
        (newsletter) => !newsletter.id || typeof newsletter.id !== 'string'
      );
      if (invalidNewsletters.length > 0) {
        errors.push({
          field: 'newsletters',
          message: 'Each newsletter must have an id field',
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

  // Name is optional but must be a string if provided
  if (updateData.name !== undefined && typeof updateData.name !== 'string') {
    errors.push({ field: 'name', message: 'Name must be a string' });
  }

  // Note is optional but must be a string if provided
  if (updateData.note !== undefined && typeof updateData.note !== 'string') {
    errors.push({ field: 'note', message: 'Note must be a string' });
  }

  // Labels is optional but must be an array if provided
  if (updateData.labels !== undefined && !Array.isArray(updateData.labels)) {
    errors.push({ field: 'labels', message: 'Labels must be an array' });
  }

  // Newsletters is optional but must be an array of objects with id field
  if (updateData.newsletters !== undefined) {
    if (!Array.isArray(updateData.newsletters)) {
      errors.push({ field: 'newsletters', message: 'Newsletters must be an array' });
    } else {
      // Validate each newsletter has an id
      const invalidNewsletters = updateData.newsletters.filter(
        (newsletter) => !newsletter.id || typeof newsletter.id !== 'string'
      );
      if (invalidNewsletters.length > 0) {
        errors.push({
          field: 'newsletters',
          message: 'Each newsletter must have an id field',
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
