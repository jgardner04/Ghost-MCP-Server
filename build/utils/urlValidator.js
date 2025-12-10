import Joi from 'joi';
import { URL } from 'url';

// Configure allowed domains for image downloads
const ALLOWED_DOMAINS = [
  // Common CDNs and image hosting services
  'imgur.com',
  'i.imgur.com',
  'github.com',
  'githubusercontent.com',
  'unsplash.com',
  'images.unsplash.com',
  'cloudinary.com',
  'res.cloudinary.com',
  'amazonaws.com',
  's3.amazonaws.com',
  'googleusercontent.com',
  'gravatar.com',
  'secure.gravatar.com',
  'wp.com',
  'wordpress.com',
  'flickr.com',
  'staticflickr.com',
  'dropbox.com',
  'dl.dropboxusercontent.com',
  'pexels.com',
  'images.pexels.com',
  'pixabay.com',
  'cdn.pixabay.com',
];

// Private/internal IP ranges to block
const BLOCKED_IP_PATTERNS = [
  /^127\./, // 127.0.0.0/8 - localhost
  /^10\./, // 10.0.0.0/8 - private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 - private
  /^192\.168\./, // 192.168.0.0/16 - private
  /^169\.254\./, // 169.254.0.0/16 - link local
  /^0\./, // 0.0.0.0/8
  /^224\./, // 224.0.0.0/4 - multicast
  /^240\./, // 240.0.0.0/4 - reserved
  /^255\.255\.255\.255$/, // broadcast
  /^::1$/, // IPv6 localhost
  /^::/, // IPv6 unspecified
  /^fc00:/, // IPv6 unique local
  /^fe80:/, // IPv6 link local
  /^ff00:/, // IPv6 multicast
];

/**
 * Validates if a hostname/IP is safe for external requests
 * @param {string} hostname - The hostname or IP to validate
 * @returns {boolean} True if safe, false if blocked
 */
const isSafeHost = (hostname) => {
  // Check if hostname is an IP address
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const ipv6Pattern = /^[0-9a-f:]+$/i;

  if (ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname)) {
    // Check against blocked IP patterns
    return !BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname));
  }

  // For domain names, check against allowlist
  const normalizedHost = hostname.toLowerCase();
  return ALLOWED_DOMAINS.some(
    (allowed) => normalizedHost === allowed || normalizedHost.endsWith('.' + allowed)
  );
};

/**
 * Validates and sanitizes a URL for safe external requests
 * @param {string} url - The URL to validate
 * @returns {object} Validation result with isValid boolean and sanitizedUrl
 */
const validateImageUrl = (url) => {
  try {
    // Basic URL validation with Joi
    const urlSchema = Joi.string()
      .uri({
        scheme: ['http', 'https'],
        allowRelative: false,
      })
      .required();

    const validation = urlSchema.validate(url);
    if (validation.error) {
      return {
        isValid: false,
        error: `Invalid URL format: ${validation.error.details[0].message}`,
      };
    }

    // Parse URL for additional security checks
    const parsedUrl = new URL(url);

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        isValid: false,
        error: 'Only HTTP and HTTPS protocols are allowed',
      };
    }

    // Check if host is safe (not internal/private)
    if (!isSafeHost(parsedUrl.hostname)) {
      return {
        isValid: false,
        error: `Requests to ${parsedUrl.hostname} are not allowed for security reasons`,
      };
    }

    // Prevent requests to non-standard ports (common in SSRF attacks)
    const port = parsedUrl.port;
    if (port && !['80', '443', '8080', '8443'].includes(port)) {
      return {
        isValid: false,
        error: `Requests to non-standard port ${port} are not allowed`,
      };
    }

    // Additional checks for suspicious patterns
    if (
      parsedUrl.hostname.includes('localhost') ||
      parsedUrl.hostname === '0.0.0.0' ||
      parsedUrl.hostname.startsWith('192.168.') ||
      parsedUrl.hostname.startsWith('10.') ||
      parsedUrl.hostname.includes('.local')
    ) {
      return {
        isValid: false,
        error: 'Requests to local/private addresses are not allowed',
      };
    }

    return {
      isValid: true,
      sanitizedUrl: parsedUrl.href,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `URL parsing failed: ${error.message}`,
    };
  }
};

/**
 * Configures axios with security settings for external requests
 * @param {string} url - The validated URL to request
 * @returns {object} Axios configuration with security settings
 */
const createSecureAxiosConfig = (url) => {
  return {
    url,
    responseType: 'stream',
    timeout: 10000, // 10 second timeout
    maxRedirects: 3, // Limit redirects
    maxContentLength: 50 * 1024 * 1024, // 50MB max response
    validateStatus: (status) => status >= 200 && status < 300, // Only accept 2xx
    headers: {
      'User-Agent': 'Ghost-MCP-Server/1.0',
    },
  };
};

export { validateImageUrl, createSecureAxiosConfig, ALLOWED_DOMAINS };
