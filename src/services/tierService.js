import { ValidationError } from '../errors/index.js';

/**
 * Maximum length constants (following Ghost's database constraints)
 */
const MAX_NAME_LENGTH = 191; // Ghost's typical varchar limit
const MAX_DESCRIPTION_LENGTH = 2000; // Reasonable limit for descriptions

/**
 * Query constraints for tier browsing
 */
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_PAGE = 1;

/**
 * Currency code validation regex (3-letter uppercase)
 */
const CURRENCY_REGEX = /^[A-Z]{3}$/;

/**
 * URL validation regex (simple HTTP/HTTPS validation)
 */
const URL_REGEX = /^https?:\/\/.+/i;

/**
 * Validates tier data for creation
 * @param {Object} tierData - The tier data to validate
 * @throws {ValidationError} If validation fails
 */
export function validateTierData(tierData) {
  const errors = [];

  // Name is required and must be a non-empty string
  if (!tierData.name || typeof tierData.name !== 'string' || tierData.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required and must be a non-empty string' });
  } else if (tierData.name.length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `Name must not exceed ${MAX_NAME_LENGTH} characters` });
  }

  // Currency is required and must be a 3-letter uppercase code
  if (!tierData.currency || typeof tierData.currency !== 'string') {
    errors.push({ field: 'currency', message: 'Currency is required' });
  } else if (!CURRENCY_REGEX.test(tierData.currency)) {
    errors.push({
      field: 'currency',
      message: 'Currency must be a 3-letter uppercase code (e.g., USD, EUR)',
    });
  }

  // Description is optional but must be a string with valid length if provided
  if (tierData.description !== undefined) {
    if (typeof tierData.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (tierData.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: 'description',
        message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
  }

  // Monthly price is optional but must be a non-negative number if provided
  if (tierData.monthly_price !== undefined) {
    if (typeof tierData.monthly_price !== 'number' || tierData.monthly_price < 0) {
      errors.push({
        field: 'monthly_price',
        message: 'Monthly price must be a non-negative number',
      });
    }
  }

  // Yearly price is optional but must be a non-negative number if provided
  if (tierData.yearly_price !== undefined) {
    if (typeof tierData.yearly_price !== 'number' || tierData.yearly_price < 0) {
      errors.push({
        field: 'yearly_price',
        message: 'Yearly price must be a non-negative number',
      });
    }
  }

  // Benefits is optional but must be an array of non-empty strings if provided
  if (tierData.benefits !== undefined) {
    if (!Array.isArray(tierData.benefits)) {
      errors.push({ field: 'benefits', message: 'Benefits must be an array' });
    } else {
      // Validate each benefit is a non-empty string
      const invalidBenefits = tierData.benefits.filter(
        (benefit) => typeof benefit !== 'string' || benefit.trim().length === 0
      );
      if (invalidBenefits.length > 0) {
        errors.push({
          field: 'benefits',
          message: 'Each benefit must be a non-empty string',
        });
      }
    }
  }

  // Welcome page URL is optional but must be a valid HTTP/HTTPS URL if provided
  if (tierData.welcome_page_url !== undefined) {
    if (
      typeof tierData.welcome_page_url !== 'string' ||
      !URL_REGEX.test(tierData.welcome_page_url)
    ) {
      errors.push({
        field: 'welcome_page_url',
        message: 'Welcome page URL must be a valid URL',
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Tier validation failed', errors);
  }
}

/**
 * Validates tier data for update
 * All fields are optional for updates, but if provided they must be valid
 * @param {Object} updateData - The tier update data to validate
 * @throws {ValidationError} If validation fails
 */
export function validateTierUpdateData(updateData) {
  const errors = [];

  // Name is optional for update but must be a non-empty string with valid length if provided
  if (updateData.name !== undefined) {
    if (typeof updateData.name !== 'string' || updateData.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name must be a non-empty string' });
    } else if (updateData.name.length > MAX_NAME_LENGTH) {
      errors.push({ field: 'name', message: `Name must not exceed ${MAX_NAME_LENGTH} characters` });
    }
  }

  // Currency is optional for update but must be a 3-letter uppercase code if provided
  if (updateData.currency !== undefined) {
    if (typeof updateData.currency !== 'string' || !CURRENCY_REGEX.test(updateData.currency)) {
      errors.push({
        field: 'currency',
        message: 'Currency must be a 3-letter uppercase code (e.g., USD, EUR)',
      });
    }
  }

  // Description is optional but must be a string with valid length if provided
  if (updateData.description !== undefined) {
    if (typeof updateData.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (updateData.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: 'description',
        message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
  }

  // Monthly price is optional but must be a non-negative number if provided
  if (updateData.monthly_price !== undefined) {
    if (typeof updateData.monthly_price !== 'number' || updateData.monthly_price < 0) {
      errors.push({
        field: 'monthly_price',
        message: 'Monthly price must be a non-negative number',
      });
    }
  }

  // Yearly price is optional but must be a non-negative number if provided
  if (updateData.yearly_price !== undefined) {
    if (typeof updateData.yearly_price !== 'number' || updateData.yearly_price < 0) {
      errors.push({
        field: 'yearly_price',
        message: 'Yearly price must be a non-negative number',
      });
    }
  }

  // Benefits is optional but must be an array of non-empty strings if provided
  if (updateData.benefits !== undefined) {
    if (!Array.isArray(updateData.benefits)) {
      errors.push({ field: 'benefits', message: 'Benefits must be an array' });
    } else {
      // Validate each benefit is a non-empty string
      const invalidBenefits = updateData.benefits.filter(
        (benefit) => typeof benefit !== 'string' || benefit.trim().length === 0
      );
      if (invalidBenefits.length > 0) {
        errors.push({
          field: 'benefits',
          message: 'Each benefit must be a non-empty string',
        });
      }
    }
  }

  // Welcome page URL is optional but must be a valid HTTP/HTTPS URL if provided
  if (updateData.welcome_page_url !== undefined) {
    if (
      typeof updateData.welcome_page_url !== 'string' ||
      !URL_REGEX.test(updateData.welcome_page_url)
    ) {
      errors.push({
        field: 'welcome_page_url',
        message: 'Welcome page URL must be a valid URL',
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Tier validation failed', errors);
  }
}

/**
 * Validates query options for tier browsing
 * @param {Object} options - The query options to validate
 * @param {number} [options.limit] - Number of tiers to return (1-100)
 * @param {number} [options.page] - Page number (1+)
 * @param {string} [options.filter] - NQL filter string
 * @param {string} [options.order] - Order string (e.g., 'created_at desc')
 * @param {string} [options.include] - Include string (e.g., 'monthly_price,yearly_price')
 * @throws {ValidationError} If validation fails
 */
export function validateTierQueryOptions(options) {
  const errors = [];

  // Validate limit
  if (options.limit !== undefined) {
    if (
      typeof options.limit !== 'number' ||
      options.limit < MIN_LIMIT ||
      options.limit > MAX_LIMIT
    ) {
      errors.push({
        field: 'limit',
        message: `Limit must be a number between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      });
    }
  }

  // Validate page
  if (options.page !== undefined) {
    if (typeof options.page !== 'number' || options.page < MIN_PAGE) {
      errors.push({
        field: 'page',
        message: `Page must be a number >= ${MIN_PAGE}`,
      });
    }
  }

  // Validate filter (must be non-empty string if provided)
  if (options.filter !== undefined) {
    if (typeof options.filter !== 'string' || options.filter.trim().length === 0) {
      errors.push({
        field: 'filter',
        message: 'Filter must be a non-empty string',
      });
    }
  }

  // Validate order (must be non-empty string if provided)
  if (options.order !== undefined) {
    if (typeof options.order !== 'string' || options.order.trim().length === 0) {
      errors.push({
        field: 'order',
        message: 'Order must be a non-empty string',
      });
    }
  }

  // Validate include (must be non-empty string if provided)
  if (options.include !== undefined) {
    if (typeof options.include !== 'string' || options.include.trim().length === 0) {
      errors.push({
        field: 'include',
        message: 'Include must be a non-empty string',
      });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Tier query validation failed', errors);
  }
}

/**
 * Sanitizes a value for use in NQL filters to prevent injection
 * Escapes backslashes, single quotes, and double quotes
 * @param {string} value - The value to sanitize
 * @returns {string} The sanitized value
 */
export function sanitizeNqlValue(value) {
  if (!value) return value;
  // Escape backslashes first, then quotes
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

export default {
  validateTierData,
  validateTierUpdateData,
  validateTierQueryOptions,
  sanitizeNqlValue,
};
