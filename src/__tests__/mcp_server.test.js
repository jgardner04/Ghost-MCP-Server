import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store tool implementations for testing
const toolImplementations = {};

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const mockServerInstance = {
    addResource: vi.fn(),
    addTool: vi.fn(),
    listen: vi.fn().mockResolvedValue(undefined),
    listResources: vi.fn().mockReturnValue([{ name: 'ghost/tag' }, { name: 'ghost/post' }]),
    listTools: vi
      .fn()
      .mockReturnValue([
        { name: 'ghost_create_post' },
        { name: 'ghost_upload_image' },
        { name: 'ghost_get_tags' },
        { name: 'ghost_create_tag' },
      ]),
  };

  return {
    MCPServer: class MockMCPServer {
      constructor() {
        Object.assign(this, mockServerInstance);
      }

      static getInstance() {
        return mockServerInstance;
      }
    },
    Resource: class MockResource {
      constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.schema = config.schema;
      }
    },
    Tool: class MockTool {
      constructor(config) {
        toolImplementations[config.name] = config.implementation;
        this.name = config.name;
        this.description = config.description;
        this.inputSchema = config.inputSchema;
        this.outputSchema = config.outputSchema;
        this.implementation = config.implementation;
      }
    },
  };
});

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock services
const mockCreatePostService = vi.fn();
const mockUploadGhostImage = vi.fn();
const mockGetGhostTags = vi.fn();
const mockCreateGhostTag = vi.fn();
const mockProcessImage = vi.fn();

vi.mock('../services/postService.js', () => ({
  createPostService: (...args) => mockCreatePostService(...args),
}));

vi.mock('../services/ghostService.js', () => ({
  uploadImage: (...args) => mockUploadGhostImage(...args),
  getTags: (...args) => mockGetGhostTags(...args),
  createTag: (...args) => mockCreateGhostTag(...args),
}));

vi.mock('../services/imageProcessingService.js', () => ({
  processImage: (...args) => mockProcessImage(...args),
}));

// Mock axios
const mockAxios = vi.fn();
vi.mock('axios', () => ({
  default: (...args) => mockAxios(...args),
}));

// Mock fs
const mockCreateWriteStream = vi.fn();
vi.mock('fs', () => ({
  default: {
    createWriteStream: (...args) => mockCreateWriteStream(...args),
  },
}));

// Mock tempFileManager
const mockTrackTempFile = vi.fn();
const mockCleanupTempFiles = vi.fn().mockResolvedValue(undefined);
vi.mock('../utils/tempFileManager.js', () => ({
  trackTempFile: (...args) => mockTrackTempFile(...args),
  cleanupTempFiles: (...args) => mockCleanupTempFiles(...args),
}));

// Mock os
vi.mock('os', () => ({
  default: { tmpdir: vi.fn().mockReturnValue('/tmp') },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1234'),
}));

// Mock urlValidator
const mockValidateImageUrl = vi.fn();
const mockCreateSecureAxiosConfig = vi.fn();
vi.mock('../utils/urlValidator.js', () => ({
  validateImageUrl: (...args) => mockValidateImageUrl(...args),
  createSecureAxiosConfig: (...args) => mockCreateSecureAxiosConfig(...args),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createContextLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    toolExecution: vi.fn(),
    toolSuccess: vi.fn(),
    toolError: vi.fn(),
    fileOperation: vi.fn(),
  }),
}));

describe('mcp_server', () => {
  let mcpServerModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Import module once to register tools
    if (!mcpServerModule) {
      mcpServerModule = await import('../mcp_server.js');
    }
  });

  describe('ghost_create_post tool', () => {
    it('should call createPostService with input and return result', async () => {
      const createdPost = {
        id: '1',
        title: 'Test Post',
        html: '<p>Content</p>',
        status: 'draft',
      };
      mockCreatePostService.mockResolvedValue(createdPost);

      const input = { title: 'Test Post', html: '<p>Content</p>' };
      const result = await toolImplementations.ghost_create_post(input);

      expect(mockCreatePostService).toHaveBeenCalledWith(input);
      expect(result).toEqual(createdPost);
    });

    it('should handle tags and other optional fields', async () => {
      const createdPost = { id: '1', title: 'Test', tags: ['tech'] };
      mockCreatePostService.mockResolvedValue(createdPost);

      const input = {
        title: 'Test',
        html: '<p>Content</p>',
        tags: ['tech'],
        status: 'published',
        feature_image: 'https://example.com/image.jpg',
      };
      const result = await toolImplementations.ghost_create_post(input);

      expect(mockCreatePostService).toHaveBeenCalledWith(input);
      expect(result).toEqual(createdPost);
    });

    it('should throw wrapped error when service fails', async () => {
      mockCreatePostService.mockRejectedValue(new Error('Database error'));

      const input = { title: 'Test Post', html: '<p>Content</p>' };

      await expect(toolImplementations.ghost_create_post(input)).rejects.toThrow(
        'Failed to create Ghost post: Database error'
      );
    });
  });

  describe('ghost_upload_image tool', () => {
    beforeEach(() => {
      mockValidateImageUrl.mockReturnValue({
        isValid: true,
        sanitizedUrl: 'https://example.com/image.jpg',
      });
      mockCreateSecureAxiosConfig.mockReturnValue({
        url: 'https://example.com/image.jpg',
        responseType: 'stream',
      });

      const mockWriter = {
        on: vi.fn((event, cb) => {
          if (event === 'finish') setTimeout(cb, 0);
          return mockWriter;
        }),
      };
      mockCreateWriteStream.mockReturnValue(mockWriter);

      const mockStream = { pipe: vi.fn().mockReturnValue(mockWriter) };
      mockAxios.mockResolvedValue({ data: mockStream });

      mockProcessImage.mockResolvedValue('/tmp/processed-image.jpg');
      mockUploadGhostImage.mockResolvedValue({
        url: 'https://ghost.com/content/images/image.jpg',
      });
    });

    it('should validate image URL for SSRF protection', async () => {
      mockValidateImageUrl.mockReturnValue({
        isValid: false,
        error: 'Private IP address not allowed',
      });

      const input = { imageUrl: 'http://192.168.1.1/image.jpg' };

      await expect(toolImplementations.ghost_upload_image(input)).rejects.toThrow(
        'Invalid image URL: Private IP address not allowed'
      );
    });

    it('should download, process, and upload image successfully', async () => {
      const input = { imageUrl: 'https://example.com/image.jpg' };
      const result = await toolImplementations.ghost_upload_image(input);

      expect(mockValidateImageUrl).toHaveBeenCalledWith(input.imageUrl);
      expect(mockAxios).toHaveBeenCalled();
      expect(mockProcessImage).toHaveBeenCalled();
      expect(mockUploadGhostImage).toHaveBeenCalled();
      expect(result.url).toBe('https://ghost.com/content/images/image.jpg');
    });

    it('should use provided alt text', async () => {
      const input = { imageUrl: 'https://example.com/image.jpg', alt: 'My custom alt' };
      const result = await toolImplementations.ghost_upload_image(input);

      expect(result.alt).toBe('My custom alt');
    });

    it('should generate default alt text from filename', async () => {
      const input = { imageUrl: 'https://example.com/beautiful-sunset.jpg' };
      const result = await toolImplementations.ghost_upload_image(input);

      expect(result.alt).toBeTruthy();
      expect(result.alt).not.toBe('');
    });

    it('should cleanup temporary files on success', async () => {
      const input = { imageUrl: 'https://example.com/image.jpg' };
      await toolImplementations.ghost_upload_image(input);

      expect(mockCleanupTempFiles).toHaveBeenCalled();
    });

    it('should cleanup temporary files on error', async () => {
      mockUploadGhostImage.mockRejectedValue(new Error('Upload failed'));

      const input = { imageUrl: 'https://example.com/image.jpg' };
      await expect(toolImplementations.ghost_upload_image(input)).rejects.toThrow();

      expect(mockCleanupTempFiles).toHaveBeenCalled();
    });

    it('should handle download errors', async () => {
      mockAxios.mockRejectedValue(new Error('Network error'));

      const input = { imageUrl: 'https://example.com/image.jpg' };
      await expect(toolImplementations.ghost_upload_image(input)).rejects.toThrow(
        'Failed to upload image from URL'
      );
    });

    it('should handle processing errors', async () => {
      mockProcessImage.mockRejectedValue(new Error('Invalid image format'));

      const input = { imageUrl: 'https://example.com/image.jpg' };
      await expect(toolImplementations.ghost_upload_image(input)).rejects.toThrow(
        'Failed to upload image from URL'
      );
    });
  });

  describe('ghost_get_tags tool', () => {
    it('should get all tags without filter', async () => {
      const tags = [
        { id: '1', name: 'Tag1', slug: 'tag1' },
        { id: '2', name: 'Tag2', slug: 'tag2' },
      ];
      mockGetGhostTags.mockResolvedValue(tags);

      const result = await toolImplementations.ghost_get_tags({});

      expect(mockGetGhostTags).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(tags);
    });

    it('should filter tags by name', async () => {
      const tags = [{ id: '1', name: 'Technology', slug: 'technology' }];
      mockGetGhostTags.mockResolvedValue(tags);

      const result = await toolImplementations.ghost_get_tags({ name: 'Technology' });

      expect(mockGetGhostTags).toHaveBeenCalledWith('Technology');
      expect(result).toEqual(tags);
    });

    it('should return empty array when no tags match', async () => {
      mockGetGhostTags.mockResolvedValue([]);

      const result = await toolImplementations.ghost_get_tags({ name: 'NonExistent' });

      expect(result).toEqual([]);
    });

    it('should throw wrapped error when service fails', async () => {
      mockGetGhostTags.mockRejectedValue(new Error('API error'));

      await expect(toolImplementations.ghost_get_tags({})).rejects.toThrow(
        'Failed to get Ghost tags: API error'
      );
    });
  });

  describe('ghost_create_tag tool', () => {
    it('should create tag with name only', async () => {
      const newTag = { id: '1', name: 'NewTag', slug: 'newtag' };
      mockCreateGhostTag.mockResolvedValue(newTag);

      const input = { name: 'NewTag' };
      const result = await toolImplementations.ghost_create_tag(input);

      expect(mockCreateGhostTag).toHaveBeenCalledWith(input);
      expect(result).toEqual(newTag);
    });

    it('should create tag with all fields', async () => {
      const newTag = {
        id: '1',
        name: 'Tech',
        slug: 'technology',
        description: 'Tech articles',
      };
      mockCreateGhostTag.mockResolvedValue(newTag);

      const input = { name: 'Tech', slug: 'technology', description: 'Tech articles' };
      const result = await toolImplementations.ghost_create_tag(input);

      expect(mockCreateGhostTag).toHaveBeenCalledWith(input);
      expect(result).toEqual(newTag);
    });

    it('should throw wrapped error when service fails', async () => {
      mockCreateGhostTag.mockRejectedValue(new Error('Duplicate tag'));

      await expect(toolImplementations.ghost_create_tag({ name: 'Existing' })).rejects.toThrow(
        'Failed to create Ghost tag: Duplicate tag'
      );
    });
  });

  describe('startMCPServer', () => {
    it('should export startMCPServer function', async () => {
      const { startMCPServer } = await import('../mcp_server.js');
      expect(typeof startMCPServer).toBe('function');
    });
  });

  describe('module exports', () => {
    it('should export mcpServer', async () => {
      const module = await import('../mcp_server.js');
      expect(module.mcpServer).toBeDefined();
    });

    it('should export startMCPServer', async () => {
      const module = await import('../mcp_server.js');
      expect(module.startMCPServer).toBeDefined();
    });
  });
});
