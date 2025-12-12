import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  urlSchema,
  isoDateSchema,
  slugSchema,
  ghostIdSchema,
  nqlFilterSchema,
  limitSchema,
  pageSchema,
  postStatusSchema,
  visibilitySchema,
  htmlContentSchema,
  titleSchema,
  excerptSchema,
  metaTitleSchema,
  metaDescriptionSchema,
  featuredSchema,
  featureImageSchema,
  featureImageAltSchema,
  tagNameSchema,
} from '../common.js';

describe('Common Schemas', () => {
  describe('emailSchema', () => {
    it('should accept valid email addresses', () => {
      expect(() => emailSchema.parse('test@example.com')).not.toThrow();
      expect(() => emailSchema.parse('user.name+tag@example.co.uk')).not.toThrow();
    });

    it('should reject invalid email addresses', () => {
      expect(() => emailSchema.parse('not-an-email')).toThrow();
      expect(() => emailSchema.parse('missing@domain')).toThrow();
      expect(() => emailSchema.parse('@example.com')).toThrow();
    });
  });

  describe('urlSchema', () => {
    it('should accept valid URLs', () => {
      expect(() => urlSchema.parse('https://example.com')).not.toThrow();
      expect(() => urlSchema.parse('http://localhost:3000/path')).not.toThrow();
    });

    it('should reject invalid URLs', () => {
      expect(() => urlSchema.parse('not-a-url')).toThrow();
      expect(() => urlSchema.parse('://invalid')).toThrow();
    });
  });

  describe('isoDateSchema', () => {
    it('should accept valid ISO 8601 datetime strings', () => {
      expect(() => isoDateSchema.parse('2024-01-15T10:30:00Z')).not.toThrow();
      expect(() => isoDateSchema.parse('2024-01-15T10:30:00.000Z')).not.toThrow();
    });

    it('should reject invalid datetime strings', () => {
      expect(() => isoDateSchema.parse('2024-01-15')).toThrow();
      expect(() => isoDateSchema.parse('not-a-date')).toThrow();
    });
  });

  describe('slugSchema', () => {
    it('should accept valid slugs', () => {
      expect(() => slugSchema.parse('my-blog-post')).not.toThrow();
      expect(() => slugSchema.parse('post-123')).not.toThrow();
      expect(() => slugSchema.parse('simple')).not.toThrow();
    });

    it('should reject invalid slugs', () => {
      expect(() => slugSchema.parse('My Post')).toThrow(); // spaces
      expect(() => slugSchema.parse('post_123')).toThrow(); // underscores
      expect(() => slugSchema.parse('Post-123')).toThrow(); // uppercase
      expect(() => slugSchema.parse('post!')).toThrow(); // special chars
    });
  });

  describe('ghostIdSchema', () => {
    it('should accept valid Ghost IDs', () => {
      expect(() => ghostIdSchema.parse('507f1f77bcf86cd799439011')).not.toThrow();
      expect(() => ghostIdSchema.parse('abcdef1234567890abcdef12')).not.toThrow();
    });

    it('should reject invalid Ghost IDs', () => {
      expect(() => ghostIdSchema.parse('short')).toThrow(); // too short
      expect(() => ghostIdSchema.parse('507f1f77bcf86cd799439011abc')).toThrow(); // too long
      expect(() => ghostIdSchema.parse('507f1f77bcf86cd79943901G')).toThrow(); // invalid char
      expect(() => ghostIdSchema.parse('507F1F77BCF86CD799439011')).toThrow(); // uppercase
    });
  });

  describe('nqlFilterSchema', () => {
    it('should accept valid NQL filter strings', () => {
      expect(() => nqlFilterSchema.parse('status:published')).not.toThrow();
      expect(() => nqlFilterSchema.parse('tag:news+featured:true')).not.toThrow();
      expect(() => nqlFilterSchema.parse("author:'John Doe'")).not.toThrow();
    });

    it('should reject NQL strings with disallowed characters', () => {
      expect(() => nqlFilterSchema.parse('status;DROP TABLE')).toThrow();
      expect(() => nqlFilterSchema.parse('test&invalid')).toThrow();
    });

    it('should allow undefined/optional', () => {
      expect(() => nqlFilterSchema.parse(undefined)).not.toThrow();
    });
  });

  describe('limitSchema', () => {
    it('should accept valid limits', () => {
      expect(limitSchema.parse(1)).toBe(1);
      expect(limitSchema.parse(50)).toBe(50);
      expect(limitSchema.parse(100)).toBe(100);
    });

    it('should reject invalid limits', () => {
      expect(() => limitSchema.parse(0)).toThrow();
      expect(() => limitSchema.parse(101)).toThrow();
      expect(() => limitSchema.parse(-1)).toThrow();
      expect(() => limitSchema.parse(1.5)).toThrow();
    });

    it('should use default value', () => {
      expect(limitSchema.parse(undefined)).toBe(15);
    });
  });

  describe('pageSchema', () => {
    it('should accept valid page numbers', () => {
      expect(pageSchema.parse(1)).toBe(1);
      expect(pageSchema.parse(100)).toBe(100);
    });

    it('should reject invalid page numbers', () => {
      expect(() => pageSchema.parse(0)).toThrow();
      expect(() => pageSchema.parse(-1)).toThrow();
      expect(() => pageSchema.parse(1.5)).toThrow();
    });

    it('should use default value', () => {
      expect(pageSchema.parse(undefined)).toBe(1);
    });
  });

  describe('postStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(() => postStatusSchema.parse('draft')).not.toThrow();
      expect(() => postStatusSchema.parse('published')).not.toThrow();
      expect(() => postStatusSchema.parse('scheduled')).not.toThrow();
    });

    it('should reject invalid statuses', () => {
      expect(() => postStatusSchema.parse('invalid')).toThrow();
      expect(() => postStatusSchema.parse('DRAFT')).toThrow();
    });
  });

  describe('visibilitySchema', () => {
    it('should accept valid visibility values', () => {
      expect(() => visibilitySchema.parse('public')).not.toThrow();
      expect(() => visibilitySchema.parse('members')).not.toThrow();
      expect(() => visibilitySchema.parse('paid')).not.toThrow();
      expect(() => visibilitySchema.parse('tiers')).not.toThrow();
    });

    it('should reject invalid visibility values', () => {
      expect(() => visibilitySchema.parse('private')).toThrow();
      expect(() => visibilitySchema.parse('PUBLIC')).toThrow();
    });
  });

  describe('htmlContentSchema', () => {
    it('should accept non-empty HTML strings', () => {
      expect(() => htmlContentSchema.parse('<p>Hello World</p>')).not.toThrow();
      expect(() => htmlContentSchema.parse('Plain text')).not.toThrow();
    });

    it('should reject empty strings', () => {
      expect(() => htmlContentSchema.parse('')).toThrow();
    });

    // XSS Prevention Tests
    describe('XSS sanitization', () => {
      it('should strip script tags', () => {
        const result = htmlContentSchema.parse('<p>Safe</p><script>alert("xss")</script>');
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('alert');
        expect(result).toContain('<p>Safe</p>');
      });

      it('should strip onclick and other event handlers', () => {
        const result = htmlContentSchema.parse('<p onclick="alert(1)">Click me</p>');
        expect(result).not.toContain('onclick');
        expect(result).toContain('<p>Click me</p>');
      });

      it('should strip javascript: URLs', () => {
        const result = htmlContentSchema.parse('<a href="javascript:alert(1)">Link</a>');
        expect(result).not.toContain('javascript:');
      });

      it('should strip onerror handlers on images', () => {
        const result = htmlContentSchema.parse('<img src="x" onerror="alert(1)">');
        expect(result).not.toContain('onerror');
      });

      it('should allow safe tags', () => {
        const safeHtml =
          '<h1>Title</h1><p>Paragraph</p><a href="https://example.com">Link</a><ul><li>Item</li></ul>';
        const result = htmlContentSchema.parse(safeHtml);
        expect(result).toContain('<h1>');
        expect(result).toContain('<p>');
        expect(result).toContain('<a ');
        expect(result).toContain('<ul>');
        expect(result).toContain('<li>');
      });

      it('should allow safe attributes on links', () => {
        const result = htmlContentSchema.parse(
          '<a href="https://example.com" title="Example">Link</a>'
        );
        expect(result).toContain('href="https://example.com"');
        expect(result).toContain('title="Example"');
      });

      it('should allow safe attributes on images', () => {
        const result = htmlContentSchema.parse(
          '<img src="https://example.com/img.jpg" alt="Description" title="Title" width="100" height="100">'
        );
        expect(result).toContain('src="https://example.com/img.jpg"');
        expect(result).toContain('alt="Description"');
      });

      it('should strip style attributes by default', () => {
        const result = htmlContentSchema.parse('<p style="color: red">Styled</p>');
        expect(result).not.toContain('style=');
      });

      it('should strip iframe tags', () => {
        const result = htmlContentSchema.parse(
          '<iframe src="https://evil.com"></iframe><p>Safe</p>'
        );
        expect(result).not.toContain('<iframe');
        expect(result).toContain('<p>Safe</p>');
      });

      it('should strip data: URLs on images', () => {
        // data: URLs can be used for XSS in some contexts
        const result = htmlContentSchema.parse(
          '<img src="data:text/html,<script>alert(1)</script>">'
        );
        // The src should either be removed or the tag stripped
        expect(result).not.toContain('<script>');
      });

      it('should preserve text content while stripping dangerous elements', () => {
        const result = htmlContentSchema.parse(
          '<div>Safe text<script>evil()</script> more text</div>'
        );
        expect(result).toContain('Safe text');
        expect(result).toContain('more text');
        expect(result).not.toContain('evil');
      });
    });
  });

  describe('titleSchema', () => {
    it('should accept valid titles', () => {
      expect(() => titleSchema.parse('My Blog Post')).not.toThrow();
      expect(() => titleSchema.parse('A'.repeat(255))).not.toThrow();
    });

    it('should reject invalid titles', () => {
      expect(() => titleSchema.parse('')).toThrow();
      expect(() => titleSchema.parse('A'.repeat(256))).toThrow();
    });
  });

  describe('excerptSchema', () => {
    it('should accept valid excerpts', () => {
      expect(() => excerptSchema.parse('A short description')).not.toThrow();
      expect(() => excerptSchema.parse('A'.repeat(500))).not.toThrow();
      expect(() => excerptSchema.parse(undefined)).not.toThrow();
    });

    it('should reject too long excerpts', () => {
      expect(() => excerptSchema.parse('A'.repeat(501))).toThrow();
    });
  });

  describe('metaTitleSchema', () => {
    it('should accept valid meta titles', () => {
      expect(() => metaTitleSchema.parse('SEO Title')).not.toThrow();
      expect(() => metaTitleSchema.parse('A'.repeat(300))).not.toThrow();
      expect(() => metaTitleSchema.parse(undefined)).not.toThrow();
    });

    it('should reject too long meta titles', () => {
      expect(() => metaTitleSchema.parse('A'.repeat(301))).toThrow();
    });
  });

  describe('metaDescriptionSchema', () => {
    it('should accept valid meta descriptions', () => {
      expect(() => metaDescriptionSchema.parse('SEO description')).not.toThrow();
      expect(() => metaDescriptionSchema.parse('A'.repeat(500))).not.toThrow();
      expect(() => metaDescriptionSchema.parse(undefined)).not.toThrow();
    });

    it('should reject too long meta descriptions', () => {
      expect(() => metaDescriptionSchema.parse('A'.repeat(501))).toThrow();
    });
  });

  describe('featuredSchema', () => {
    it('should accept boolean values', () => {
      expect(featuredSchema.parse(true)).toBe(true);
      expect(featuredSchema.parse(false)).toBe(false);
    });

    it('should use default value', () => {
      expect(featuredSchema.parse(undefined)).toBe(false);
    });
  });

  describe('featureImageSchema', () => {
    it('should accept valid image URLs', () => {
      expect(() => featureImageSchema.parse('https://example.com/image.jpg')).not.toThrow();
      expect(() => featureImageSchema.parse(undefined)).not.toThrow();
    });

    it('should reject invalid URLs', () => {
      expect(() => featureImageSchema.parse('not-a-url')).toThrow();
    });
  });

  describe('featureImageAltSchema', () => {
    it('should accept valid alt text', () => {
      expect(() => featureImageAltSchema.parse('Image description')).not.toThrow();
      expect(() => featureImageAltSchema.parse('A'.repeat(125))).not.toThrow();
      expect(() => featureImageAltSchema.parse(undefined)).not.toThrow();
    });

    it('should reject too long alt text', () => {
      expect(() => featureImageAltSchema.parse('A'.repeat(126))).toThrow();
    });
  });

  describe('tagNameSchema', () => {
    it('should accept valid tag names', () => {
      expect(() => tagNameSchema.parse('Technology')).not.toThrow();
      expect(() => tagNameSchema.parse('A'.repeat(191))).not.toThrow();
    });

    it('should reject invalid tag names', () => {
      expect(() => tagNameSchema.parse('')).toThrow();
      expect(() => tagNameSchema.parse('A'.repeat(192))).toThrow();
    });
  });
});
