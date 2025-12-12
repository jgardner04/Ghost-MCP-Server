import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateToolInput } from '../validation.js';

describe('validateToolInput', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    count: z.number().int().positive(),
  });

  describe('valid input', () => {
    it('should return success with validated data for valid input', () => {
      const result = validateToolInput(testSchema, { name: 'test', count: 5 }, 'test_tool');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', count: 5 });
    });

    it('should not include errorResponse on success', () => {
      const result = validateToolInput(testSchema, { name: 'test', count: 5 }, 'test_tool');

      expect(result.success).toBe(true);
      expect(result).not.toHaveProperty('errorResponse');
    });
  });

  describe('invalid input', () => {
    it('should return error response for invalid input', () => {
      const result = validateToolInput(testSchema, { name: '', count: -1 }, 'test_tool');

      expect(result.success).toBe(false);
      expect(result.errorResponse.isError).toBe(true);
      expect(result.errorResponse.content[0].type).toBe('text');
    });

    it('should include tool name in error context', () => {
      const result = validateToolInput(testSchema, {}, 'ghost_create_tag');

      expect(result.success).toBe(false);
      const errorText = result.errorResponse.content[0].text;
      expect(errorText).toContain('ghost_create_tag');
      expect(errorText).toContain('Validation failed');
    });

    it('should include VALIDATION_ERROR code in response', () => {
      const result = validateToolInput(testSchema, { name: '' }, 'test_tool');

      expect(result.success).toBe(false);
      const errorText = result.errorResponse.content[0].text;
      expect(errorText).toContain('VALIDATION_ERROR');
    });

    it('should include structured error information', () => {
      const result = validateToolInput(testSchema, { name: '' }, 'test_tool');

      expect(result.success).toBe(false);
      const errorObj = JSON.parse(result.errorResponse.content[0].text);
      expect(errorObj.name).toBe('ValidationError');
      expect(errorObj.code).toBe('VALIDATION_ERROR');
      expect(errorObj.statusCode).toBe(400);
      expect(errorObj.message).toContain('Validation failed');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined input', () => {
      const result = validateToolInput(testSchema, undefined, 'test_tool');

      expect(result.success).toBe(false);
      expect(result.errorResponse.isError).toBe(true);
    });

    it('should handle null input', () => {
      const result = validateToolInput(testSchema, null, 'test_tool');

      expect(result.success).toBe(false);
      expect(result.errorResponse.isError).toBe(true);
    });

    it('should handle empty object input', () => {
      const result = validateToolInput(testSchema, {}, 'test_tool');

      expect(result.success).toBe(false);
      expect(result.errorResponse.isError).toBe(true);
    });
  });

  describe('schema transforms', () => {
    it('should apply schema transforms and return transformed data', () => {
      const transformSchema = z.object({
        value: z.string().transform((s) => s.toUpperCase()),
      });
      const result = validateToolInput(transformSchema, { value: 'test' }, 'test_tool');

      expect(result.success).toBe(true);
      expect(result.data.value).toBe('TEST');
    });

    it('should apply default values from schema', () => {
      const defaultSchema = z.object({
        name: z.string(),
        enabled: z.boolean().default(true),
      });
      const result = validateToolInput(defaultSchema, { name: 'test' }, 'test_tool');

      expect(result.success).toBe(true);
      expect(result.data.enabled).toBe(true);
    });
  });

  describe('partial schemas', () => {
    it('should work with partial schemas', () => {
      const partialSchema = testSchema.partial();
      const result = validateToolInput(partialSchema, {}, 'test_tool');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should still validate provided fields in partial schemas', () => {
      const partialSchema = testSchema.partial();
      const result = validateToolInput(partialSchema, { count: -1 }, 'test_tool');

      expect(result.success).toBe(false);
      expect(result.errorResponse.isError).toBe(true);
    });
  });

  describe('refinement schemas', () => {
    it('should handle schema refinements and return error', () => {
      const refinedSchema = z
        .object({
          id: z.string().optional(),
          slug: z.string().optional(),
        })
        .refine((data) => data.id || data.slug, {
          message: 'Either id or slug is required',
        });

      const result = validateToolInput(refinedSchema, {}, 'test_tool');

      expect(result.success).toBe(false);
      expect(result.errorResponse.isError).toBe(true);
      const errorObj = JSON.parse(result.errorResponse.content[0].text);
      expect(errorObj.code).toBe('VALIDATION_ERROR');
    });

    it('should pass validation when refinement is satisfied', () => {
      const refinedSchema = z
        .object({
          id: z.string().optional(),
          slug: z.string().optional(),
        })
        .refine((data) => data.id || data.slug, {
          message: 'Either id or slug is required',
        });

      const result = validateToolInput(refinedSchema, { id: 'abc123' }, 'test_tool');

      expect(result.success).toBe(true);
    });
  });
});
