import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the McpServer to capture tool registrations
const mockTools = new Map();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class MockMcpServer {
      constructor(config) {
        this.config = config;
      }

      tool(name, description, schema, handler) {
        mockTools.set(name, { name, description, schema, handler });
      }

      registerTool(name, options, handler) {
        // Store in the same format for backward compatibility with tests
        mockTools.set(name, {
          name,
          description: options.description,
          schema: options.inputSchema,
          handler,
        });
      }

      connect(_transport) {
        return Promise.resolve();
      }
    },
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: class MockStdioServerTransport {},
  };
});

// Mock dotenv
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// Mock crypto
vi.mock('crypto', () => ({
  default: { randomUUID: vi.fn().mockReturnValue('test-uuid-1234') },
}));

// Mock services for pages
const mockGetPages = vi.fn();
const mockGetPage = vi.fn();
const mockUpdatePage = vi.fn();
const mockDeletePage = vi.fn();
const mockSearchPages = vi.fn();
const mockCreatePageService = vi.fn();

// Also mock post and tag services to avoid errors
const mockGetPosts = vi.fn();
const mockGetPost = vi.fn();
const mockGetTags = vi.fn();
const mockCreateTag = vi.fn();
const mockUploadImage = vi.fn();
const mockCreatePostService = vi.fn();
const mockUpdatePost = vi.fn();
const mockDeletePost = vi.fn();
const mockSearchPosts = vi.fn();
const mockProcessImage = vi.fn();
const mockValidateImageUrl = vi.fn();
const mockCreateSecureAxiosConfig = vi.fn();

vi.mock('../services/ghostService.js', () => ({
  getPosts: (...args) => mockGetPosts(...args),
  getPost: (...args) => mockGetPost(...args),
  getTags: (...args) => mockGetTags(...args),
  createTag: (...args) => mockCreateTag(...args),
  uploadImage: (...args) => mockUploadImage(...args),
}));

vi.mock('../services/postService.js', () => ({
  createPostService: (...args) => mockCreatePostService(...args),
}));

vi.mock('../services/pageService.js', () => ({
  createPageService: (...args) => mockCreatePageService(...args),
}));

vi.mock('../services/ghostServiceImproved.js', () => ({
  updatePost: (...args) => mockUpdatePost(...args),
  deletePost: (...args) => mockDeletePost(...args),
  searchPosts: (...args) => mockSearchPosts(...args),
  getPages: (...args) => mockGetPages(...args),
  getPage: (...args) => mockGetPage(...args),
  updatePage: (...args) => mockUpdatePage(...args),
  deletePage: (...args) => mockDeletePage(...args),
  searchPages: (...args) => mockSearchPages(...args),
}));

vi.mock('../services/imageProcessingService.js', () => ({
  processImage: (...args) => mockProcessImage(...args),
}));

vi.mock('../utils/urlValidator.js', () => ({
  validateImageUrl: (...args) => mockValidateImageUrl(...args),
  createSecureAxiosConfig: (...args) => mockCreateSecureAxiosConfig(...args),
}));

// Mock axios
const mockAxios = vi.fn();
vi.mock('axios', () => ({
  default: (...args) => mockAxios(...args),
}));

// Mock fs
const mockUnlink = vi.fn((path, cb) => cb(null));
const mockCreateWriteStream = vi.fn();
vi.mock('fs', () => ({
  default: {
    unlink: (...args) => mockUnlink(...args),
    createWriteStream: (...args) => mockCreateWriteStream(...args),
  },
}));

// Mock os
vi.mock('os', () => ({
  default: { tmpdir: vi.fn().mockReturnValue('/tmp') },
}));

// Mock path
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    default: actual,
    ...actual,
  };
});

describe('mcp_server - ghost_get_pages tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Import the module to register tools (only first time)
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_get_pages tool', () => {
    expect(mockTools.has('ghost_get_pages')).toBe(true);
  });

  it('should have correct schema with all optional parameters', () => {
    const tool = mockTools.get('ghost_get_pages');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('pages');
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.limit).toBeDefined();
    expect(tool.schema.shape.page).toBeDefined();
    expect(tool.schema.shape.include).toBeDefined();
    expect(tool.schema.shape.filter).toBeDefined();
    expect(tool.schema.shape.order).toBeDefined();
  });

  it('should retrieve pages with default options', async () => {
    const mockPages = [
      { id: '1', title: 'About Us', slug: 'about-us', status: 'published' },
      { id: '2', title: 'Contact', slug: 'contact', status: 'draft' },
    ];
    mockGetPages.mockResolvedValue(mockPages);

    const tool = mockTools.get('ghost_get_pages');
    const result = await tool.handler({});

    expect(mockGetPages).toHaveBeenCalledWith({});
    expect(result.content[0].text).toContain('About Us');
    expect(result.content[0].text).toContain('Contact');
  });

  it('should pass limit and page parameters', async () => {
    const mockPages = [{ id: '1', title: 'Page 1', slug: 'page-1' }];
    mockGetPages.mockResolvedValue(mockPages);

    const tool = mockTools.get('ghost_get_pages');
    await tool.handler({ limit: 10, page: 2 });

    expect(mockGetPages).toHaveBeenCalledWith({ limit: 10, page: 2 });
  });

  it('should validate limit is between 1 and 100', () => {
    const tool = mockTools.get('ghost_get_pages');
    const schema = tool.schema;

    expect(schema.shape.limit).toBeDefined();
    expect(() => schema.shape.limit.parse(0)).toThrow();
    expect(() => schema.shape.limit.parse(101)).toThrow();
    expect(schema.shape.limit.parse(50)).toBe(50);
  });

  it('should pass filter parameter', async () => {
    const mockPages = [{ id: '1', title: 'Published Page', status: 'published' }];
    mockGetPages.mockResolvedValue(mockPages);

    const tool = mockTools.get('ghost_get_pages');
    await tool.handler({ filter: 'status:published' });

    expect(mockGetPages).toHaveBeenCalledWith({ filter: 'status:published' });
  });

  it('should handle errors gracefully', async () => {
    mockGetPages.mockRejectedValue(new Error('API error'));

    const tool = mockTools.get('ghost_get_pages');
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error retrieving pages');
  });
});

describe('mcp_server - ghost_get_page tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_get_page tool', () => {
    expect(mockTools.has('ghost_get_page')).toBe(true);
  });

  it('should have correct schema with id and slug options', () => {
    const tool = mockTools.get('ghost_get_page');
    expect(tool).toBeDefined();
    // ghost_get_page uses a refined schema, access via _def.schema.shape
    const shape = tool.schema._def.schema.shape;
    expect(shape.id).toBeDefined();
    expect(shape.slug).toBeDefined();
    expect(shape.include).toBeDefined();
  });

  it('should retrieve page by ID', async () => {
    const mockPage = { id: '507f1f77bcf86cd799439011', title: 'About Us', slug: 'about-us' };
    mockGetPage.mockResolvedValue(mockPage);

    const tool = mockTools.get('ghost_get_page');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(mockGetPage).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {});
    expect(result.content[0].text).toContain('About Us');
  });

  it('should retrieve page by slug', async () => {
    const mockPage = { id: '507f1f77bcf86cd799439011', title: 'About Us', slug: 'about-us' };
    mockGetPage.mockResolvedValue(mockPage);

    const tool = mockTools.get('ghost_get_page');
    const result = await tool.handler({ slug: 'about-us' });

    expect(mockGetPage).toHaveBeenCalledWith('slug/about-us', {});
    expect(result.content[0].text).toContain('About Us');
  });

  it('should require either id or slug', () => {
    const tool = mockTools.get('ghost_get_page');
    // Test schema validation - the refine check requires id or slug
    expect(() => tool.schema.parse({})).toThrow();
    // Valid inputs should parse successfully (Ghost IDs are 24 hex chars)
    expect(() => tool.schema.parse({ id: '507f1f77bcf86cd799439011' })).not.toThrow();
    expect(() => tool.schema.parse({ slug: 'about-us' })).not.toThrow();
  });

  it('should handle errors gracefully', async () => {
    mockGetPage.mockRejectedValue(new Error('Page not found'));

    const tool = mockTools.get('ghost_get_page');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error retrieving page');
  });
});

describe('mcp_server - ghost_create_page tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_create_page tool', () => {
    expect(mockTools.has('ghost_create_page')).toBe(true);
  });

  it('should have correct schema with required and optional fields', () => {
    const tool = mockTools.get('ghost_create_page');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('page');
    expect(tool.schema.shape.title).toBeDefined();
    expect(tool.schema.shape.html).toBeDefined();
    expect(tool.schema.shape.status).toBeDefined();
    expect(tool.schema.shape.feature_image).toBeDefined();
    expect(tool.schema.shape.meta_title).toBeDefined();
    expect(tool.schema.shape.meta_description).toBeDefined();
  });

  it('should create page with minimal input', async () => {
    const createdPage = { id: '507f1f77bcf86cd799439011', title: 'New Page', status: 'draft' };
    mockCreatePageService.mockResolvedValue(createdPage);

    const tool = mockTools.get('ghost_create_page');
    const result = await tool.handler({ title: 'New Page', html: '<p>Content</p>' });

    // Schema adds default values, so use objectContaining for the key fields
    expect(mockCreatePageService).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Page',
        html: '<p>Content</p>',
      })
    );
    expect(result.content[0].text).toContain('New Page');
  });

  it('should create page with all optional fields', async () => {
    const fullInput = {
      title: 'Complete Page',
      html: '<p>Content</p>',
      status: 'published',
      custom_excerpt: 'Excerpt',
      feature_image: 'https://example.com/image.jpg',
      feature_image_alt: 'Alt text',
      feature_image_caption: 'Caption',
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
    };
    const createdPage = { id: '507f1f77bcf86cd799439011', ...fullInput };
    mockCreatePageService.mockResolvedValue(createdPage);

    const tool = mockTools.get('ghost_create_page');
    const result = await tool.handler(fullInput);

    // Schema adds default values, so use objectContaining for the key fields
    expect(mockCreatePageService).toHaveBeenCalledWith(expect.objectContaining(fullInput));
    expect(result.content[0].text).toContain('Complete Page');
  });

  it('should handle errors gracefully', async () => {
    mockCreatePageService.mockRejectedValue(new Error('Invalid input'));

    const tool = mockTools.get('ghost_create_page');
    const result = await tool.handler({ title: 'Test', html: '<p>Content</p>' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error creating page');
  });
});

describe('mcp_server - ghost_update_page tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_update_page tool', () => {
    expect(mockTools.has('ghost_update_page')).toBe(true);
  });

  it('should have correct schema with id required and other fields optional', () => {
    const tool = mockTools.get('ghost_update_page');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('page');
    expect(tool.schema.shape.id).toBeDefined();
    expect(tool.schema.shape.title).toBeDefined();
    expect(tool.schema.shape.html).toBeDefined();
    expect(tool.schema.shape.status).toBeDefined();
  });

  it('should update page with new title', async () => {
    const updatedPage = { id: '507f1f77bcf86cd799439011', title: 'Updated Title' };
    mockUpdatePage.mockResolvedValue(updatedPage);

    const tool = mockTools.get('ghost_update_page');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', title: 'Updated Title' });

    expect(mockUpdatePage).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
      title: 'Updated Title',
    });
    expect(result.content[0].text).toContain('Updated Title');
  });

  it('should update page with multiple fields', async () => {
    const updatedPage = { id: '507f1f77bcf86cd799439011', title: 'New Title', status: 'published' };
    mockUpdatePage.mockResolvedValue(updatedPage);

    const tool = mockTools.get('ghost_update_page');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      title: 'New Title',
      status: 'published',
      html: '<p>Updated content</p>',
    });

    expect(mockUpdatePage).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
      title: 'New Title',
      status: 'published',
      html: '<p>Updated content</p>',
    });
    expect(result.content[0].text).toContain('New Title');
  });

  it('should handle errors gracefully', async () => {
    mockUpdatePage.mockRejectedValue(new Error('Page not found'));

    const tool = mockTools.get('ghost_update_page');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099', title: 'Test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error updating page');
  });
});

describe('mcp_server - ghost_delete_page tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_delete_page tool', () => {
    expect(mockTools.has('ghost_delete_page')).toBe(true);
  });

  it('should have correct schema with id required', () => {
    const tool = mockTools.get('ghost_delete_page');
    expect(tool).toBeDefined();
    expect(tool.schema.shape.id).toBeDefined();
    expect(tool.description).toContain('permanent');
  });

  it('should delete page by ID', async () => {
    mockDeletePage.mockResolvedValue({ id: '507f1f77bcf86cd799439011' });

    const tool = mockTools.get('ghost_delete_page');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(mockDeletePage).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(result.content[0].text).toContain('successfully deleted');
  });

  it('should handle errors gracefully', async () => {
    mockDeletePage.mockRejectedValue(new Error('Page not found'));

    const tool = mockTools.get('ghost_delete_page');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error deleting page');
  });
});

describe('mcp_server - ghost_search_pages tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_search_pages tool', () => {
    expect(mockTools.has('ghost_search_pages')).toBe(true);
  });

  it('should have correct schema with query required', () => {
    const tool = mockTools.get('ghost_search_pages');
    expect(tool).toBeDefined();
    expect(tool.schema.shape.query).toBeDefined();
    expect(tool.schema.shape.status).toBeDefined();
    expect(tool.schema.shape.limit).toBeDefined();
  });

  it('should search pages with query', async () => {
    const mockPages = [{ id: '1', title: 'About Us', slug: 'about-us' }];
    mockSearchPages.mockResolvedValue(mockPages);

    const tool = mockTools.get('ghost_search_pages');
    const result = await tool.handler({ query: 'about' });

    expect(mockSearchPages).toHaveBeenCalledWith('about', {});
    expect(result.content[0].text).toContain('About Us');
  });

  it('should pass status filter', async () => {
    const mockPages = [{ id: '1', title: 'Published Page' }];
    mockSearchPages.mockResolvedValue(mockPages);

    const tool = mockTools.get('ghost_search_pages');
    await tool.handler({ query: 'test', status: 'published' });

    expect(mockSearchPages).toHaveBeenCalledWith('test', { status: 'published' });
  });

  it('should pass limit option', async () => {
    const mockPages = [];
    mockSearchPages.mockResolvedValue(mockPages);

    const tool = mockTools.get('ghost_search_pages');
    await tool.handler({ query: 'test', limit: 5 });

    expect(mockSearchPages).toHaveBeenCalledWith('test', { limit: 5 });
  });

  it('should validate limit is between 1 and 50', () => {
    const tool = mockTools.get('ghost_search_pages');
    const schema = tool.schema;

    expect(schema.shape.limit).toBeDefined();
    expect(() => schema.shape.limit.parse(0)).toThrow();
    expect(() => schema.shape.limit.parse(51)).toThrow();
    expect(schema.shape.limit.parse(25)).toBe(25);
  });

  it('should handle errors gracefully', async () => {
    mockSearchPages.mockRejectedValue(new Error('Search failed'));

    const tool = mockTools.get('ghost_search_pages');
    const result = await tool.handler({ query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error searching pages');
  });
});
