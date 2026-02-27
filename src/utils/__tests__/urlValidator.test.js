import { describe, it, expect } from 'vitest';
import {
  validateImageUrl,
  createSecureAxiosConfig,
  createBeforeRedirect,
  isSafeHost,
  ALLOWED_DOMAINS,
} from '../urlValidator.js';

describe('urlValidator', () => {
  describe('ALLOWED_DOMAINS', () => {
    it('should export an array of allowed domains', () => {
      expect(ALLOWED_DOMAINS).toBeInstanceOf(Array);
      expect(ALLOWED_DOMAINS.length).toBeGreaterThan(0);
      expect(ALLOWED_DOMAINS).toContain('imgur.com');
      expect(ALLOWED_DOMAINS).toContain('github.com');
    });
  });

  describe('isSafeHost (tested via validateImageUrl)', () => {
    describe('allowed domains', () => {
      it('should allow imgur.com', () => {
        const result = validateImageUrl('https://imgur.com/image.jpg');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedUrl).toBe('https://imgur.com/image.jpg');
      });

      it('should allow i.imgur.com subdomain', () => {
        const result = validateImageUrl('https://i.imgur.com/abc123.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow github.com', () => {
        const result = validateImageUrl('https://github.com/user/repo/image.png');
        expect(result.isValid).toBe(true);
      });

      it('should allow githubusercontent.com', () => {
        const result = validateImageUrl('https://githubusercontent.com/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow unsplash.com', () => {
        const result = validateImageUrl('https://unsplash.com/photo.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow images.unsplash.com subdomain', () => {
        const result = validateImageUrl('https://images.unsplash.com/photo-123');
        expect(result.isValid).toBe(true);
      });

      it('should allow cloudinary.com', () => {
        const result = validateImageUrl('https://cloudinary.com/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow res.cloudinary.com subdomain', () => {
        const result = validateImageUrl('https://res.cloudinary.com/demo/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow amazonaws.com', () => {
        const result = validateImageUrl('https://amazonaws.com/bucket/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow s3.amazonaws.com subdomain', () => {
        const result = validateImageUrl('https://s3.amazonaws.com/bucket/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow deep subdomains of allowed domains', () => {
        const result = validateImageUrl('https://cdn.images.unsplash.com/photo.jpg');
        expect(result.isValid).toBe(true);
      });
    });

    describe('blocked IP patterns - IPv4 localhost and private ranges', () => {
      it('should block 127.0.0.1 (localhost)', () => {
        const result = validateImageUrl('https://127.0.0.1/image.jpg');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not allowed for security reasons');
      });

      it('should block 127.0.0.2 (localhost range)', () => {
        const result = validateImageUrl('https://127.0.0.2/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 127.255.255.255 (localhost range edge)', () => {
        const result = validateImageUrl('https://127.255.255.255/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 10.0.0.1 (private network)', () => {
        const result = validateImageUrl('https://10.0.0.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 10.255.255.255 (private network edge)', () => {
        const result = validateImageUrl('https://10.255.255.255/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 192.168.0.1 (private network)', () => {
        const result = validateImageUrl('https://192.168.0.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 192.168.255.255 (private network edge)', () => {
        const result = validateImageUrl('https://192.168.255.255/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 172.16.0.1 (private network)', () => {
        const result = validateImageUrl('https://172.16.0.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 172.31.255.255 (private network edge)', () => {
        const result = validateImageUrl('https://172.31.255.255/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 169.254.0.1 (link local)', () => {
        const result = validateImageUrl('https://169.254.0.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 0.0.0.0', () => {
        const result = validateImageUrl('https://0.0.0.0/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 224.0.0.1 (multicast)', () => {
        const result = validateImageUrl('https://224.0.0.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 240.0.0.1 (reserved)', () => {
        const result = validateImageUrl('https://240.0.0.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 255.255.255.255 (broadcast)', () => {
        const result = validateImageUrl('https://255.255.255.255/image.jpg');
        expect(result.isValid).toBe(false);
      });
    });

    describe('blocked IP patterns - IPv6', () => {
      it('should block ::1 (IPv6 localhost)', () => {
        const result = validateImageUrl('https://[::1]/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block :: (IPv6 unspecified)', () => {
        const result = validateImageUrl('https://[::]/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block fc00:: (IPv6 unique local)', () => {
        const result = validateImageUrl('https://[fc00::1]/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block fe80:: (IPv6 link local)', () => {
        const result = validateImageUrl('https://[fe80::1]/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block ff00:: (IPv6 multicast)', () => {
        const result = validateImageUrl('https://[ff00::1]/image.jpg');
        expect(result.isValid).toBe(false);
      });
    });

    describe('subdomain matching', () => {
      it('should allow exact domain match', () => {
        const result = validateImageUrl('https://imgur.com/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow subdomain with dot prefix', () => {
        const result = validateImageUrl('https://i.imgur.com/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow multi-level subdomains', () => {
        const result = validateImageUrl('https://cdn.images.imgur.com/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should reject domain that partially matches but is not a subdomain', () => {
        const result = validateImageUrl('https://fakeimgur.com/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should reject domain with allowed domain as substring', () => {
        const result = validateImageUrl('https://notimgur.com/image.jpg');
        expect(result.isValid).toBe(false);
      });
    });

    describe('hostname string checks for localhost/internal', () => {
      it('should block localhost hostname', () => {
        const result = validateImageUrl('https://localhost/image.jpg');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('not allowed for security reasons');
      });

      it('should block localhost with port', () => {
        const result = validateImageUrl('https://localhost:3000/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 0.0.0.0 hostname', () => {
        const result = validateImageUrl('https://0.0.0.0/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 192.168.x.x hostname pattern', () => {
        const result = validateImageUrl('https://192.168.1.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block 10.x.x.x hostname pattern', () => {
        const result = validateImageUrl('https://10.1.1.1/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should block .local domains', () => {
        const result = validateImageUrl('https://myserver.local/image.jpg');
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('validateImageUrl', () => {
    describe('valid HTTPS URLs', () => {
      it('should accept valid HTTPS URL from allowed domain', () => {
        const result = validateImageUrl('https://imgur.com/abc123.jpg');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedUrl).toBe('https://imgur.com/abc123.jpg');
        expect(result.error).toBeUndefined();
      });

      it('should accept HTTPS URL with query parameters', () => {
        const result = validateImageUrl('https://imgur.com/image.jpg?size=large');
        expect(result.isValid).toBe(true);
      });

      it('should accept HTTPS URL with fragment', () => {
        const result = validateImageUrl('https://imgur.com/image.jpg#section');
        expect(result.isValid).toBe(true);
      });

      it('should accept HTTPS URL with path segments', () => {
        const result = validateImageUrl('https://github.com/user/repo/blob/main/image.png');
        expect(result.isValid).toBe(true);
      });

      it('should accept HTTP URL from allowed domain', () => {
        const result = validateImageUrl('http://imgur.com/image.jpg');
        expect(result.isValid).toBe(true);
      });
    });

    describe('invalid protocols', () => {
      it('should reject file:// protocol', () => {
        const result = validateImageUrl('file:///etc/passwd');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      });

      it('should reject ftp:// protocol', () => {
        const result = validateImageUrl('ftp://example.com/image.jpg');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      });

      it('should reject data: protocol', () => {
        const result = validateImageUrl('data:image/png;base64,iVBORw0KGgo');
        expect(result.isValid).toBe(false);
      });

      it('should reject javascript: protocol', () => {
        const result = validateImageUrl('javascript:alert("xss")');
        expect(result.isValid).toBe(false);
      });

      it('should reject gopher:// protocol', () => {
        const result = validateImageUrl('gopher://example.com/image');
        expect(result.isValid).toBe(false);
      });
    });

    describe('non-standard ports', () => {
      it('should allow port 80', () => {
        const result = validateImageUrl('http://imgur.com:80/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow port 443', () => {
        const result = validateImageUrl('https://imgur.com:443/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow port 8080', () => {
        const result = validateImageUrl('https://imgur.com:8080/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should allow port 8443', () => {
        const result = validateImageUrl('https://imgur.com:8443/image.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should reject port 22 (SSH)', () => {
        const result = validateImageUrl('https://imgur.com:22/image.jpg');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('non-standard port');
      });

      it('should reject port 3000', () => {
        const result = validateImageUrl('https://imgur.com:3000/image.jpg');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('non-standard port');
      });

      it('should reject port 5432 (PostgreSQL)', () => {
        const result = validateImageUrl('https://imgur.com:5432/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should reject port 6379 (Redis)', () => {
        const result = validateImageUrl('https://imgur.com:6379/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should reject port 9200 (Elasticsearch)', () => {
        const result = validateImageUrl('https://imgur.com:9200/image.jpg');
        expect(result.isValid).toBe(false);
      });
    });

    describe('edge cases and error handling', () => {
      it('should reject empty string', () => {
        const result = validateImageUrl('');
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      });

      it('should reject malformed URL', () => {
        const result = validateImageUrl('not-a-url');
        expect(result.isValid).toBe(false);
      });

      it('should reject relative URLs', () => {
        const result = validateImageUrl('/path/to/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should reject URL without protocol', () => {
        const result = validateImageUrl('imgur.com/image.jpg');
        expect(result.isValid).toBe(false);
      });

      it('should handle URLs with special characters in path', () => {
        const result = validateImageUrl('https://imgur.com/image%20with%20spaces.jpg');
        expect(result.isValid).toBe(true);
      });

      it('should handle URLs with authentication (though domain must be allowed)', () => {
        const result = validateImageUrl('https://user:pass@imgur.com/image.jpg');
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('createSecureAxiosConfig', () => {
    it('should return config object with all required fields', () => {
      const url = 'https://imgur.com/image.jpg';
      const config = createSecureAxiosConfig(url);

      expect(config).toHaveProperty('url', url);
      expect(config).toHaveProperty('responseType', 'stream');
      expect(config).toHaveProperty('timeout', 10000);
      expect(config).toHaveProperty('maxRedirects', 3);
      expect(config).toHaveProperty('maxContentLength', 50 * 1024 * 1024);
      expect(config).toHaveProperty('validateStatus');
      expect(config).toHaveProperty('headers');
    });

    it('should set correct URL', () => {
      const url = 'https://github.com/user/repo/image.png';
      const config = createSecureAxiosConfig(url);

      expect(config.url).toBe(url);
    });

    it('should set response type to stream', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config.responseType).toBe('stream');
    });

    it('should set 10 second timeout', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config.timeout).toBe(10000);
    });

    it('should limit redirects to 3', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config.maxRedirects).toBe(3);
    });

    it('should set max content length to 50MB', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config.maxContentLength).toBe(50 * 1024 * 1024);
    });

    it('should include User-Agent header', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config.headers).toHaveProperty('User-Agent', 'Ghost-MCP-Server/1.0');
    });

    it('should have validateStatus function that accepts 2xx status codes', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(typeof config.validateStatus).toBe('function');
      expect(config.validateStatus(200)).toBe(true);
      expect(config.validateStatus(204)).toBe(true);
      expect(config.validateStatus(299)).toBe(true);
    });

    it('should have validateStatus function that rejects non-2xx status codes', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config.validateStatus(199)).toBe(false);
      expect(config.validateStatus(300)).toBe(false);
      expect(config.validateStatus(404)).toBe(false);
      expect(config.validateStatus(500)).toBe(false);
    });

    it('should handle different URLs independently', () => {
      const url1 = 'https://imgur.com/image1.jpg';
      const url2 = 'https://github.com/image2.png';

      const config1 = createSecureAxiosConfig(url1);
      const config2 = createSecureAxiosConfig(url2);

      expect(config1.url).toBe(url1);
      expect(config2.url).toBe(url2);
      expect(config1.url).not.toBe(config2.url);
    });

    it('should include beforeRedirect callback', () => {
      const config = createSecureAxiosConfig('https://imgur.com/image.jpg');
      expect(config).toHaveProperty('beforeRedirect');
      expect(typeof config.beforeRedirect).toBe('function');
    });
  });

  describe('isSafeHost', () => {
    it('should allow domains on the allowlist', () => {
      expect(isSafeHost('imgur.com')).toBe(true);
      expect(isSafeHost('i.imgur.com')).toBe(true);
      expect(isSafeHost('github.com')).toBe(true);
    });

    it('should allow subdomains of allowed domains', () => {
      expect(isSafeHost('cdn.images.unsplash.com')).toBe(true);
      expect(isSafeHost('my-bucket.s3.amazonaws.com')).toBe(true);
    });

    it('should reject domains not on the allowlist', () => {
      expect(isSafeHost('evil.com')).toBe(false);
      expect(isSafeHost('fakeimgur.com')).toBe(false);
    });

    it('should block localhost IPs', () => {
      expect(isSafeHost('127.0.0.1')).toBe(false);
      expect(isSafeHost('127.0.0.2')).toBe(false);
    });

    it('should block private network IPs', () => {
      expect(isSafeHost('10.0.0.1')).toBe(false);
      expect(isSafeHost('192.168.1.1')).toBe(false);
      expect(isSafeHost('172.16.0.1')).toBe(false);
    });

    it('should block link-local and cloud metadata IPs', () => {
      expect(isSafeHost('169.254.169.254')).toBe(false);
      expect(isSafeHost('169.254.0.1')).toBe(false);
    });

    it('should block IPv6 private addresses', () => {
      expect(isSafeHost('::1')).toBe(false);
      expect(isSafeHost('fc00::1')).toBe(false);
      expect(isSafeHost('fe80::1')).toBe(false);
    });

    it('should allow public IPs not on blocklist', () => {
      expect(isSafeHost('8.8.8.8')).toBe(true);
      expect(isSafeHost('1.1.1.1')).toBe(true);
    });
  });

  describe('createBeforeRedirect', () => {
    it('should not throw for redirects to allowed domains', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'https:',
          hostname: 'imgur.com',
          path: '/image.jpg',
        })
      ).not.toThrow();
    });

    it('should throw for redirect to 127.0.0.1 (localhost)', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'https:',
          hostname: '127.0.0.1',
          path: '/secret',
        })
      ).toThrow('Redirect blocked');
    });

    it('should throw for redirect to 169.254.169.254 (AWS metadata)', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'http:',
          hostname: '169.254.169.254',
          path: '/latest/meta-data/',
        })
      ).toThrow('Redirect blocked');
    });

    it('should throw for redirect to 192.168.x.x (private network)', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'https:',
          hostname: '192.168.1.1',
          path: '/admin',
        })
      ).toThrow('Redirect blocked');
    });

    it('should throw for redirect to 10.x.x.x (private network)', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'https:',
          hostname: '10.0.0.1',
          path: '/internal',
        })
      ).toThrow('Redirect blocked');
    });

    it('should throw for redirect to disallowed domain', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'https:',
          hostname: 'evil.com',
          path: '/payload',
        })
      ).toThrow('Redirect blocked');
    });

    it('should allow redirect between allowed domains', () => {
      const beforeRedirect = createBeforeRedirect();
      expect(() =>
        beforeRedirect({
          protocol: 'https:',
          hostname: 'images.unsplash.com',
          path: '/photo-123',
        })
      ).not.toThrow();
    });
  });
});
