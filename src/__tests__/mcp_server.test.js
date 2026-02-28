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

// Mock services - will be lazy loaded
const mockGetPosts = vi.fn();
const mockGetPost = vi.fn();
const mockGetTags = vi.fn();
const mockGetTag = vi.fn();
const mockCreateTag = vi.fn();
const mockUpdateTag = vi.fn();
const mockDeleteTag = vi.fn();
const mockUploadImage = vi.fn();
const mockCreatePostService = vi.fn();
const mockProcessImage = vi.fn();
const mockValidateImageUrl = vi.fn();
const mockCreateSecureAxiosConfig = vi.fn();
const mockUpdatePost = vi.fn();
const mockDeletePost = vi.fn();
const mockSearchPosts = vi.fn();

// Page mocks
const mockGetPages = vi.fn();
const mockGetPage = vi.fn();
const mockCreatePageService = vi.fn();
const mockUpdatePage = vi.fn();
const mockDeletePage = vi.fn();
const mockSearchPages = vi.fn();

// Member mocks
const mockCreateMember = vi.fn();
const mockUpdateMember = vi.fn();
const mockDeleteMember = vi.fn();
const mockGetMembers = vi.fn();
const mockGetMember = vi.fn();
const mockSearchMembers = vi.fn();

// Newsletter mocks
const mockGetNewsletters = vi.fn();
const mockGetNewsletter = vi.fn();
const mockCreateNewsletterService = vi.fn();
const mockUpdateNewsletter = vi.fn();
const mockDeleteNewsletter = vi.fn();

// Tier mocks
const mockGetTiers = vi.fn();
const mockGetTier = vi.fn();
const mockCreateTier = vi.fn();
const mockUpdateTier = vi.fn();
const mockDeleteTier = vi.fn();

vi.mock('../services/postService.js', () => ({
  createPostService: (...args) => mockCreatePostService(...args),
}));

vi.mock('../services/pageService.js', () => ({
  createPageService: (...args) => mockCreatePageService(...args),
}));

vi.mock('../services/newsletterService.js', () => ({
  createNewsletterService: (...args) => mockCreateNewsletterService(...args),
}));

vi.mock('../services/ghostServiceImproved.js', () => ({
  // Posts
  getPosts: (...args) => mockGetPosts(...args),
  getPost: (...args) => mockGetPost(...args),
  updatePost: (...args) => mockUpdatePost(...args),
  deletePost: (...args) => mockDeletePost(...args),
  searchPosts: (...args) => mockSearchPosts(...args),
  // Tags
  getTags: (...args) => mockGetTags(...args),
  getTag: (...args) => mockGetTag(...args),
  createTag: (...args) => mockCreateTag(...args),
  updateTag: (...args) => mockUpdateTag(...args),
  deleteTag: (...args) => mockDeleteTag(...args),
  // Images
  uploadImage: (...args) => mockUploadImage(...args),
  // Pages
  getPages: (...args) => mockGetPages(...args),
  getPage: (...args) => mockGetPage(...args),
  updatePage: (...args) => mockUpdatePage(...args),
  deletePage: (...args) => mockDeletePage(...args),
  searchPages: (...args) => mockSearchPages(...args),
  // Members
  createMember: (...args) => mockCreateMember(...args),
  updateMember: (...args) => mockUpdateMember(...args),
  deleteMember: (...args) => mockDeleteMember(...args),
  getMembers: (...args) => mockGetMembers(...args),
  getMember: (...args) => mockGetMember(...args),
  searchMembers: (...args) => mockSearchMembers(...args),
  // Newsletters
  getNewsletters: (...args) => mockGetNewsletters(...args),
  getNewsletter: (...args) => mockGetNewsletter(...args),
  updateNewsletter: (...args) => mockUpdateNewsletter(...args),
  deleteNewsletter: (...args) => mockDeleteNewsletter(...args),
  // Tiers
  getTiers: (...args) => mockGetTiers(...args),
  getTier: (...args) => mockGetTier(...args),
  createTier: (...args) => mockCreateTier(...args),
  updateTier: (...args) => mockUpdateTier(...args),
  deleteTier: (...args) => mockDeleteTier(...args),
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

// Mock path
vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    default: actual,
    ...actual,
  };
});

describe('mcp_server - ghost_get_posts tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    // Import the module to register tools (only first time)
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_get_posts tool', () => {
    expect(mockTools.has('ghost_get_posts')).toBe(true);
  });

  it('should have correct schema with all optional parameters', () => {
    const tool = mockTools.get('ghost_get_posts');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('posts');
    expect(tool.schema).toBeDefined();
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.limit).toBeDefined();
    expect(tool.schema.shape.page).toBeDefined();
    expect(tool.schema.shape.status).toBeDefined();
    expect(tool.schema.shape.include).toBeDefined();
    expect(tool.schema.shape.filter).toBeDefined();
    expect(tool.schema.shape.order).toBeDefined();
    expect(tool.schema.shape.fields).toBeDefined();
    expect(tool.schema.shape.formats).toBeDefined();
  });

  it('should retrieve posts with default options', async () => {
    const mockPosts = [
      { id: '1', title: 'Post 1', slug: 'post-1', status: 'published' },
      { id: '2', title: 'Post 2', slug: 'post-2', status: 'draft' },
    ];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    const result = await tool.handler({});

    expect(mockGetPosts).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(result.content[0].text).toContain('Post 1');
    expect(result.content[0].text).toContain('Post 2');
  });

  it('should pass limit and page parameters', async () => {
    const mockPosts = [{ id: '1', title: 'Post 1', slug: 'post-1' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ limit: 10, page: 2 });

    expect(mockGetPosts).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, page: 2 }));
  });

  it('should validate limit is between 1 and 100', () => {
    const tool = mockTools.get('ghost_get_posts');
    // Zod schemas store field definitions in schema.shape
    const shape = tool.schema.shape;

    // Test that limit schema exists and has proper validation
    expect(shape.limit).toBeDefined();
    expect(() => shape.limit.parse(0)).toThrow();
    expect(() => shape.limit.parse(101)).toThrow();
    expect(shape.limit.parse(50)).toBe(50);
  });

  it('should validate page is at least 1', () => {
    const tool = mockTools.get('ghost_get_posts');
    // Zod schemas store field definitions in schema.shape
    const shape = tool.schema.shape;

    expect(shape.page).toBeDefined();
    expect(() => shape.page.parse(0)).toThrow();
    expect(shape.page.parse(1)).toBe(1);
  });

  it('should pass status filter', async () => {
    const mockPosts = [{ id: '1', title: 'Published Post', status: 'published' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ status: 'published' });

    expect(mockGetPosts).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
  });

  it('should validate status enum values', () => {
    const tool = mockTools.get('ghost_get_posts');
    // Zod schemas store field definitions in schema.shape
    const shape = tool.schema.shape;

    expect(shape.status).toBeDefined();
    expect(() => shape.status.parse('invalid')).toThrow();
    expect(shape.status.parse('published')).toBe('published');
    expect(shape.status.parse('draft')).toBe('draft');
    expect(shape.status.parse('scheduled')).toBe('scheduled');
    expect(shape.status.parse('all')).toBe('all');
  });

  it('should pass include parameter', async () => {
    const mockPosts = [
      {
        id: '1',
        title: 'Post with tags',
        tags: [{ name: 'tech' }],
        authors: [{ name: 'John' }],
      },
    ];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ include: 'tags,authors' });

    expect(mockGetPosts).toHaveBeenCalledWith(expect.objectContaining({ include: 'tags,authors' }));
  });

  it('should pass filter parameter (NQL)', async () => {
    const mockPosts = [{ id: '1', title: 'Featured Post', featured: true }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ filter: 'featured:true' });

    expect(mockGetPosts).toHaveBeenCalledWith(expect.objectContaining({ filter: 'featured:true' }));
  });

  it('should pass order parameter', async () => {
    const mockPosts = [
      { id: '1', title: 'Newest', published_at: '2025-12-10' },
      { id: '2', title: 'Older', published_at: '2025-12-01' },
    ];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ order: 'published_at DESC' });

    expect(mockGetPosts).toHaveBeenCalledWith(
      expect.objectContaining({ order: 'published_at DESC' })
    );
  });

  it('should pass fields parameter', async () => {
    const mockPosts = [{ id: '1', title: 'Test Post', slug: 'test-post' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ fields: 'id,title,slug' });

    expect(mockGetPosts).toHaveBeenCalledWith(expect.objectContaining({ fields: 'id,title,slug' }));
  });

  it('should pass formats parameter', async () => {
    const mockPosts = [{ id: '1', title: 'Test Post', html: '<p>Content</p>' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ formats: 'html,plaintext' });

    expect(mockGetPosts).toHaveBeenCalledWith(
      expect.objectContaining({ formats: 'html,plaintext' })
    );
  });

  it('should pass both fields and formats parameters', async () => {
    const mockPosts = [{ id: '1', title: 'Test Post' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ fields: 'id,title', formats: 'html' });

    expect(mockGetPosts).toHaveBeenCalledWith(
      expect.objectContaining({ fields: 'id,title', formats: 'html' })
    );
  });

  it('should pass all parameters combined', async () => {
    const mockPosts = [{ id: '1', title: 'Test Post' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({
      limit: 20,
      page: 1,
      status: 'published',
      include: 'tags,authors',
      filter: 'featured:true',
      order: 'published_at DESC',
      fields: 'id,title,slug',
      formats: 'html,plaintext',
    });

    expect(mockGetPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        page: 1,
        status: 'published',
        include: 'tags,authors',
        filter: 'featured:true',
        order: 'published_at DESC',
        fields: 'id,title,slug',
        formats: 'html,plaintext',
      })
    );
  });

  it('should handle errors from ghostService', async () => {
    mockGetPosts.mockRejectedValue(new Error('Ghost API error'));

    const tool = mockTools.get('ghost_get_posts');
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return formatted JSON response', async () => {
    const mockPosts = [
      {
        id: '1',
        title: 'Test Post',
        slug: 'test-post',
        html: '<p>Content</p>',
        status: 'published',
      },
    ];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    const result = await tool.handler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "1"');
    expect(result.content[0].text).toContain('"title": "Test Post"');
  });
});

describe('mcp_server - ghost_get_tags tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_get_tags tool', () => {
    expect(mockTools.has('ghost_get_tags')).toBe(true);
  });

  it('should have correct schema with all optional parameters', () => {
    const tool = mockTools.get('ghost_get_tags');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('tags');
    expect(tool.schema).toBeDefined();
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.limit).toBeDefined();
    expect(tool.schema.shape.page).toBeDefined();
    expect(tool.schema.shape.order).toBeDefined();
    expect(tool.schema.shape.include).toBeDefined();
    expect(tool.schema.shape.name).toBeDefined();
    expect(tool.schema.shape.slug).toBeDefined();
    expect(tool.schema.shape.visibility).toBeDefined();
    expect(tool.schema.shape.filter).toBeDefined();
  });

  it('should retrieve tags with default options', async () => {
    const mockTags = [
      { id: '1', name: 'Tag 1', slug: 'tag-1' },
      { id: '2', name: 'Tag 2', slug: 'tag-2' },
    ];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    const result = await tool.handler({});

    expect(mockGetTags).toHaveBeenCalledWith(expect.objectContaining({}));
    expect(result.content[0].text).toContain('Tag 1');
    expect(result.content[0].text).toContain('Tag 2');
  });

  it('should pass limit and page parameters', async () => {
    const mockTags = [{ id: '1', name: 'Tag 1', slug: 'tag-1' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ limit: 10, page: 2 });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        page: 2,
      })
    );
  });

  it('should pass order parameter', async () => {
    const mockTags = [{ id: '1', name: 'Tag 1', slug: 'tag-1' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ order: 'name ASC' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        order: 'name ASC',
      })
    );
  });

  it('should pass include parameter', async () => {
    const mockTags = [{ id: '1', name: 'Tag 1', slug: 'tag-1' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ include: 'count.posts' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        include: 'count.posts',
      })
    );
  });

  it('should filter by name parameter', async () => {
    const mockTags = [{ id: '1', name: 'Test Tag', slug: 'test-tag' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ name: 'Test Tag' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "name:'Test Tag'",
      })
    );
  });

  it('should filter by slug parameter', async () => {
    const mockTags = [{ id: '1', name: 'Test Tag', slug: 'test-tag' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ slug: 'test-tag' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "slug:'test-tag'",
      })
    );
  });

  it('should filter by visibility parameter', async () => {
    const mockTags = [{ id: '1', name: 'Test Tag', slug: 'test-tag' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ visibility: 'public' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "visibility:'public'",
      })
    );
  });

  it('should escape single quotes in name parameter', async () => {
    const mockTags = [{ id: '1', name: "O'Reilly", slug: 'oreilly' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ name: "O'Reilly" });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "name:'O''Reilly'",
      })
    );
  });

  it('should escape single quotes in slug parameter', async () => {
    const mockTags = [{ id: '1', name: 'Test', slug: "test'slug" }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ slug: "test'slug" });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "slug:'test''slug'",
      })
    );
  });

  it('should combine multiple filter parameters', async () => {
    const mockTags = [{ id: '1', name: 'News', slug: 'news' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ name: 'News', visibility: 'public' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "name:'News'+visibility:'public'",
      })
    );
  });

  it('should combine individual filters with custom filter parameter', async () => {
    const mockTags = [{ id: '1', name: 'News', slug: 'news' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({ name: 'News', filter: 'featured:true' });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "name:'News'+featured:true",
      })
    );
  });

  it('should pass all parameters combined', async () => {
    const mockTags = [{ id: '1', name: 'News', slug: 'news' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    await tool.handler({
      limit: 20,
      page: 1,
      order: 'name ASC',
      include: 'count.posts',
      name: 'News',
      visibility: 'public',
    });

    expect(mockGetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        page: 1,
        order: 'name ASC',
        include: 'count.posts',
        filter: "name:'News'+visibility:'public'",
      })
    );
  });

  it('should handle service errors', async () => {
    mockGetTags.mockRejectedValue(new Error('Service error'));

    const tool = mockTools.get('ghost_get_tags');
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Service error');
  });

  it('should return formatted JSON response', async () => {
    const mockTags = [{ id: '1', name: 'Test Tag', slug: 'test-tag' }];
    mockGetTags.mockResolvedValue(mockTags);

    const tool = mockTools.get('ghost_get_tags');
    const result = await tool.handler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "1"');
    expect(result.content[0].text).toContain('"name": "Test Tag"');
  });
});

describe('mcp_server - ghost_get_post tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_get_post tool', () => {
    expect(mockTools.has('ghost_get_post')).toBe(true);
  });

  it('should have correct schema requiring one of id or slug', () => {
    const tool = mockTools.get('ghost_get_post');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('post');
    expect(tool.schema).toBeDefined();
    // In Zod v4, refined schemas expose .shape directly
    const shape = tool.schema.shape;
    expect(shape.id).toBeDefined();
    expect(shape.slug).toBeDefined();
    expect(shape.include).toBeDefined();
  });

  it('should retrieve post by ID', async () => {
    const mockPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(mockGetPost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({})
    );
    expect(result.content[0].text).toContain('"id": "507f1f77bcf86cd799439011"');
    expect(result.content[0].text).toContain('"title": "Test Post"');
  });

  it('should retrieve post by slug', async () => {
    const mockPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ slug: 'test-post' });

    expect(mockGetPost).toHaveBeenCalledWith('slug/test-post', expect.objectContaining({}));
    expect(result.content[0].text).toContain('"title": "Test Post"');
  });

  it('should pass include parameter with ID', async () => {
    const mockPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Post with relations',
      tags: [{ name: 'tech' }],
      authors: [{ name: 'John' }],
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    await tool.handler({ id: '507f1f77bcf86cd799439011', include: 'tags,authors' });

    expect(mockGetPost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        include: 'tags,authors',
      })
    );
  });

  it('should pass include parameter with slug', async () => {
    const mockPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Post with relations',
      slug: 'test-post',
      tags: [{ name: 'tech' }],
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    await tool.handler({ slug: 'test-post', include: 'tags' });

    expect(mockGetPost).toHaveBeenCalledWith(
      'slug/test-post',
      expect.objectContaining({ include: 'tags' })
    );
  });

  it('should prefer ID over slug when both provided', async () => {
    const mockPost = { id: '507f1f77bcf86cd799439011', title: 'Test Post', slug: 'test-post' };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    await tool.handler({ id: '507f1f77bcf86cd799439011', slug: 'wrong-slug' });

    expect(mockGetPost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({})
    );
  });

  it('should handle not found errors', async () => {
    mockGetPost.mockRejectedValue(new Error('Post not found'));

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Post not found');
  });

  it('should handle errors from ghostService', async () => {
    mockGetPost.mockRejectedValue(new Error('Ghost API error'));

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ slug: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return formatted JSON response', async () => {
    const mockPost = {
      id: '507f1f77bcf86cd799439011',
      uuid: 'uuid-123',
      title: 'Test Post',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
      created_at: '2025-12-10T00:00:00.000Z',
      updated_at: '2025-12-10T00:00:00.000Z',
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "507f1f77bcf86cd799439011"');
    expect(result.content[0].text).toContain('"title": "Test Post"');
    expect(result.content[0].text).toContain('"status": "published"');
  });

  it('should handle validation error when neither id nor slug provided', async () => {
    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Either id or slug is required');
  });
});

describe('mcp_server - ghost_update_post tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_update_post tool', () => {
    expect(mockTools.has('ghost_update_post')).toBe(true);
  });

  it('should have correct schema with required id field', () => {
    const tool = mockTools.get('ghost_update_post');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Updates an existing post');
    expect(tool.schema).toBeDefined();
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.id).toBeDefined();
    expect(tool.schema.shape.title).toBeDefined();
    expect(tool.schema.shape.html).toBeDefined();
    expect(tool.schema.shape.status).toBeDefined();
    expect(tool.schema.shape.tags).toBeDefined();
    expect(tool.schema.shape.feature_image).toBeDefined();
    expect(tool.schema.shape.feature_image_alt).toBeDefined();
    expect(tool.schema.shape.feature_image_caption).toBeDefined();
    expect(tool.schema.shape.meta_title).toBeDefined();
    expect(tool.schema.shape.meta_description).toBeDefined();
    expect(tool.schema.shape.published_at).toBeDefined();
    expect(tool.schema.shape.custom_excerpt).toBeDefined();
  });

  it('should update post title', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Updated Title',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', title: 'Updated Title' });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        title: 'Updated Title',
      })
    );
    expect(result.content[0].text).toContain('"title": "Updated Title"');
  });

  it('should update post content', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      html: '<p>Updated content</p>',
      status: 'published',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      html: '<p>Updated content</p>',
    });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        html: '<p>Updated content</p>',
      })
    );
    expect(result.content[0].text).toContain('Updated content');
  });

  it('should update post status', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      html: '<p>Content</p>',
      status: 'published',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', status: 'published' });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        status: 'published',
      })
    );
    expect(result.content[0].text).toContain('"status": "published"');
  });

  it('should update post tags', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      html: '<p>Content</p>',
      tags: [{ name: 'tech' }, { name: 'javascript' }],
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      tags: ['tech', 'javascript'],
    });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        tags: ['tech', 'javascript'],
      })
    );
    expect(result.content[0].text).toContain('tech');
    expect(result.content[0].text).toContain('javascript');
  });

  it('should update post featured image', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      feature_image: 'https://example.com/new-image.jpg',
      feature_image_alt: 'New image',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      feature_image: 'https://example.com/new-image.jpg',
      feature_image_alt: 'New image',
    });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        feature_image: 'https://example.com/new-image.jpg',
        feature_image_alt: 'New image',
      })
    );
    expect(result.content[0].text).toContain('new-image.jpg');
  });

  it('should update SEO meta fields', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Test Post',
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
    });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        meta_title: 'SEO Title',
        meta_description: 'SEO Description',
      })
    );
    expect(result.content[0].text).toContain('SEO Title');
    expect(result.content[0].text).toContain('SEO Description');
  });

  it('should update multiple fields at once', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      title: 'Updated Title',
      html: '<p>Updated content</p>',
      status: 'published',
      tags: [{ name: 'tech' }],
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      title: 'Updated Title',
      html: '<p>Updated content</p>',
      status: 'published',
      tags: ['tech'],
    });

    expect(mockUpdatePost).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        title: 'Updated Title',
        html: '<p>Updated content</p>',
        status: 'published',
        tags: ['tech'],
      })
    );
    expect(result.content[0].text).toContain('Updated Title');
  });

  it('should handle not found errors', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Post not found'));

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099', title: 'New Title' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Post not found');
  });

  it('should handle validation errors', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Validation failed: Title is required'));

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', title: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation failed');
  });

  it('should handle Ghost API errors', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Ghost API error: Server timeout'));

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', title: 'Updated' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return formatted JSON response', async () => {
    const mockUpdatedPost = {
      id: '507f1f77bcf86cd799439011',
      uuid: 'uuid-123',
      title: 'Updated Post',
      slug: 'updated-post',
      html: '<p>Updated content</p>',
      status: 'published',
      created_at: '2025-12-09T00:00:00.000Z',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', title: 'Updated Post' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "507f1f77bcf86cd799439011"');
    expect(result.content[0].text).toContain('"title": "Updated Post"');
    expect(result.content[0].text).toContain('"status": "published"');
  });
});

describe('mcp_server - ghost_delete_post tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_delete_post tool', () => {
    expect(mockTools.has('ghost_delete_post')).toBe(true);
  });

  it('should have correct schema with required id field', () => {
    const tool = mockTools.get('ghost_delete_post');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Deletes a post');
    expect(tool.description).toContain('permanent');
    expect(tool.schema).toBeDefined();
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.id).toBeDefined();
  });

  it('should delete post by ID', async () => {
    mockDeletePost.mockResolvedValue({ deleted: true });

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(mockDeletePost).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(result.content[0].text).toContain(
      'Post 507f1f77bcf86cd799439011 has been successfully deleted'
    );
    expect(result.isError).toBeUndefined();
  });

  it('should handle not found errors', async () => {
    mockDeletePost.mockRejectedValue(new Error('Post not found'));

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Post not found');
  });

  it('should handle Ghost API errors', async () => {
    mockDeletePost.mockRejectedValue(new Error('Ghost API error: Permission denied'));

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return success message on successful deletion', async () => {
    mockDeletePost.mockResolvedValue({ deleted: true });

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe(
      'Post 507f1f77bcf86cd799439011 has been successfully deleted.'
    );
  });

  it('should handle network errors', async () => {
    mockDeletePost.mockRejectedValue(new Error('Network error: Connection refused'));

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439012' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });
});

describe('mcp_server - ghost_search_posts tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server.js');
    }
  });

  it('should register ghost_search_posts tool', () => {
    expect(mockTools.has('ghost_search_posts')).toBe(true);
  });

  it('should have correct schema with required query and optional parameters', () => {
    const tool = mockTools.get('ghost_search_posts');
    expect(tool).toBeDefined();
    expect(tool.description).toContain('Search');
    expect(tool.schema).toBeDefined();
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.query).toBeDefined();
    expect(tool.schema.shape.status).toBeDefined();
    expect(tool.schema.shape.limit).toBeDefined();
  });

  it('should search posts with query only', async () => {
    const mockPosts = [
      { id: '1', title: 'JavaScript Tips', slug: 'javascript-tips', status: 'published' },
      { id: '2', title: 'JavaScript Tricks', slug: 'javascript-tricks', status: 'published' },
    ];
    mockSearchPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_search_posts');
    const result = await tool.handler({ query: 'JavaScript' });

    expect(mockSearchPosts).toHaveBeenCalledWith('JavaScript', expect.objectContaining({}));
    expect(result.content[0].text).toContain('JavaScript Tips');
    expect(result.content[0].text).toContain('JavaScript Tricks');
  });

  it('should search posts with query and status filter', async () => {
    const mockPosts = [
      { id: '1', title: 'Published Post', slug: 'published-post', status: 'published' },
    ];
    mockSearchPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_search_posts');
    await tool.handler({ query: 'test', status: 'published' });

    expect(mockSearchPosts).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ status: 'published' })
    );
  });

  it('should search posts with query and limit', async () => {
    const mockPosts = [{ id: '1', title: 'Test Post', slug: 'test-post' }];
    mockSearchPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_search_posts');
    await tool.handler({ query: 'test', limit: 10 });

    expect(mockSearchPosts).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 10 }));
  });

  it('should validate limit is between 1 and 50', () => {
    const tool = mockTools.get('ghost_search_posts');
    // Zod schemas store field definitions in schema.shape
    const shape = tool.schema.shape;

    expect(shape.limit).toBeDefined();
    expect(() => shape.limit.parse(0)).toThrow();
    expect(() => shape.limit.parse(51)).toThrow();
    expect(shape.limit.parse(25)).toBe(25);
  });

  it('should validate status enum values', () => {
    const tool = mockTools.get('ghost_search_posts');
    // Zod schemas store field definitions in schema.shape
    const shape = tool.schema.shape;

    expect(shape.status).toBeDefined();
    expect(() => shape.status.parse('invalid')).toThrow();
    expect(shape.status.parse('published')).toBe('published');
    expect(shape.status.parse('draft')).toBe('draft');
    expect(shape.status.parse('scheduled')).toBe('scheduled');
    expect(shape.status.parse('all')).toBe('all');
  });

  it('should pass all parameters combined', async () => {
    const mockPosts = [{ id: '1', title: 'Test Post' }];
    mockSearchPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_search_posts');
    await tool.handler({
      query: 'JavaScript',
      status: 'published',
      limit: 20,
    });

    expect(mockSearchPosts).toHaveBeenCalledWith(
      'JavaScript',
      expect.objectContaining({
        status: 'published',
        limit: 20,
      })
    );
  });

  it('should handle errors from searchPosts', async () => {
    // Empty query is now caught by Zod validation
    const tool = mockTools.get('ghost_search_posts');
    const result = await tool.handler({ query: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('should handle Ghost API errors', async () => {
    mockSearchPosts.mockRejectedValue(new Error('Ghost API error'));

    const tool = mockTools.get('ghost_search_posts');
    const result = await tool.handler({ query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return formatted JSON response', async () => {
    const mockPosts = [
      {
        id: '1',
        title: 'Test Post',
        slug: 'test-post',
        html: '<p>Content</p>',
        status: 'published',
      },
    ];
    mockSearchPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_search_posts');
    const result = await tool.handler({ query: 'Test' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "1"');
    expect(result.content[0].text).toContain('"title": "Test Post"');
  });

  it('should return empty array when no results found', async () => {
    mockSearchPosts.mockResolvedValue([]);

    const tool = mockTools.get('ghost_search_posts');
    const result = await tool.handler({ query: 'nonexistent' });

    expect(result.content[0].text).toBe('[]');
    expect(result.isError).toBeUndefined();
  });
});

describe('ghost_get_tag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be registered as a tool', () => {
    expect(mockTools.has('ghost_get_tag')).toBe(true);
    const tool = mockTools.get('ghost_get_tag');
    expect(tool.name).toBe('ghost_get_tag');
    expect(tool.description).toBeDefined();
    expect(tool.schema).toBeDefined();
    expect(tool.handler).toBeDefined();
  });

  it('should have correct schema with id and slug as optional', () => {
    const tool = mockTools.get('ghost_get_tag');
    // In Zod v4, refined schemas expose .shape directly
    const shape = tool.schema.shape;
    expect(shape.id).toBeDefined();
    expect(shape.slug).toBeDefined();
    expect(shape.include).toBeDefined();
  });

  it('should retrieve tag by ID', async () => {
    const mockTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Test Tag',
      slug: 'test-tag',
      description: 'A test tag',
    };
    mockGetTag.mockResolvedValue(mockTag);

    const tool = mockTools.get('ghost_get_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(mockGetTag).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({})
    );
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "507f1f77bcf86cd799439011"');
    expect(result.content[0].text).toContain('"name": "Test Tag"');
  });

  it('should retrieve tag by slug', async () => {
    const mockTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Test Tag',
      slug: 'test-tag',
      description: 'A test tag',
    };
    mockGetTag.mockResolvedValue(mockTag);

    const tool = mockTools.get('ghost_get_tag');
    const result = await tool.handler({ slug: 'test-tag' });

    expect(mockGetTag).toHaveBeenCalledWith('slug/test-tag', expect.objectContaining({}));
    expect(result.content[0].text).toContain('"slug": "test-tag"');
  });

  it('should support include parameter for post count', async () => {
    const mockTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Test Tag',
      slug: 'test-tag',
      count: { posts: 5 },
    };
    mockGetTag.mockResolvedValue(mockTag);

    const tool = mockTools.get('ghost_get_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', include: 'count.posts' });

    expect(mockGetTag).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({ include: 'count.posts' })
    );
    expect(result.content[0].text).toContain('"count"');
  });

  it('should return error when neither id nor slug provided', async () => {
    const tool = mockTools.get('ghost_get_tag');
    const result = await tool.handler({});

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Either id or slug is required');
    expect(result.isError).toBe(true);
  });

  it('should handle not found error', async () => {
    mockGetTag.mockRejectedValue(new Error('Tag not found'));

    const tool = mockTools.get('ghost_get_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tag not found');
  });
});

describe('ghost_update_tag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be registered as a tool', () => {
    expect(mockTools.has('ghost_update_tag')).toBe(true);
    const tool = mockTools.get('ghost_update_tag');
    expect(tool.name).toBe('ghost_update_tag');
    expect(tool.description).toBeDefined();
    expect(tool.schema).toBeDefined();
    expect(tool.handler).toBeDefined();
  });

  it('should have correct schema with all update fields', () => {
    const tool = mockTools.get('ghost_update_tag');
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.id).toBeDefined();
    expect(tool.schema.shape.name).toBeDefined();
    expect(tool.schema.shape.slug).toBeDefined();
    expect(tool.schema.shape.description).toBeDefined();
    expect(tool.schema.shape.feature_image).toBeDefined();
    expect(tool.schema.shape.meta_title).toBeDefined();
    expect(tool.schema.shape.meta_description).toBeDefined();
  });

  it('should update tag name', async () => {
    const mockUpdatedTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Updated Tag',
      slug: 'updated-tag',
    };
    mockUpdateTag.mockResolvedValue(mockUpdatedTag);

    const tool = mockTools.get('ghost_update_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', name: 'Updated Tag' });

    expect(mockUpdateTag).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({ name: 'Updated Tag' })
    );
    expect(result.content[0].text).toContain('"name": "Updated Tag"');
  });

  it('should update tag description', async () => {
    const mockUpdatedTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Test Tag',
      description: 'New description',
    };
    mockUpdateTag.mockResolvedValue(mockUpdatedTag);

    const tool = mockTools.get('ghost_update_tag');
    const result = await tool.handler({
      id: '507f1f77bcf86cd799439011',
      description: 'New description',
    });

    expect(mockUpdateTag).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        description: 'New description',
      })
    );
    expect(result.content[0].text).toContain('"description": "New description"');
  });

  it('should update multiple fields at once', async () => {
    const mockUpdatedTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Updated Tag',
      slug: 'updated-tag',
      description: 'Updated description',
      meta_title: 'Updated Meta',
    };
    mockUpdateTag.mockResolvedValue(mockUpdatedTag);

    const tool = mockTools.get('ghost_update_tag');
    await tool.handler({
      id: '507f1f77bcf86cd799439011',
      name: 'Updated Tag',
      description: 'Updated description',
      meta_title: 'Updated Meta',
    });

    expect(mockUpdateTag).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        name: 'Updated Tag',
        description: 'Updated description',
        meta_title: 'Updated Meta',
      })
    );
  });

  it('should update tag feature image', async () => {
    const mockUpdatedTag = {
      id: '507f1f77bcf86cd799439011',
      name: 'Test Tag',
      feature_image: 'https://example.com/image.jpg',
    };
    mockUpdateTag.mockResolvedValue(mockUpdatedTag);

    const tool = mockTools.get('ghost_update_tag');
    await tool.handler({
      id: '507f1f77bcf86cd799439011',
      feature_image: 'https://example.com/image.jpg',
    });

    expect(mockUpdateTag).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      expect.objectContaining({
        feature_image: 'https://example.com/image.jpg',
      })
    );
  });

  it('should return error when id is missing', async () => {
    const tool = mockTools.get('ghost_update_tag');
    const result = await tool.handler({ name: 'Test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('should handle validation error', async () => {
    mockUpdateTag.mockRejectedValue(new Error('Validation failed'));

    const tool = mockTools.get('ghost_update_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011', name: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation failed');
  });

  it('should handle not found error', async () => {
    mockUpdateTag.mockRejectedValue(new Error('Tag not found'));

    const tool = mockTools.get('ghost_update_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099', name: 'Test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tag not found');
  });
});

describe('ghost_delete_tag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be registered as a tool', () => {
    expect(mockTools.has('ghost_delete_tag')).toBe(true);
    const tool = mockTools.get('ghost_delete_tag');
    expect(tool.name).toBe('ghost_delete_tag');
    expect(tool.description).toBeDefined();
    expect(tool.schema).toBeDefined();
    expect(tool.handler).toBeDefined();
  });

  it('should have correct schema with id field', () => {
    const tool = mockTools.get('ghost_delete_tag');
    // Zod schemas store field definitions in schema.shape
    expect(tool.schema.shape.id).toBeDefined();
  });

  it('should delete tag successfully', async () => {
    mockDeleteTag.mockResolvedValue({ success: true });

    const tool = mockTools.get('ghost_delete_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(mockDeleteTag).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(result.content[0].text).toContain('successfully deleted');
    expect(result.isError).toBeUndefined();
  });

  it('should return error when id is missing', async () => {
    const tool = mockTools.get('ghost_delete_tag');
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('VALIDATION_ERROR');
  });

  it('should handle not found error', async () => {
    mockDeleteTag.mockRejectedValue(new Error('Tag not found'));

    const tool = mockTools.get('ghost_delete_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439099' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tag not found');
  });

  it('should handle deletion error', async () => {
    mockDeleteTag.mockRejectedValue(new Error('Failed to delete tag'));

    const tool = mockTools.get('ghost_delete_tag');
    const result = await tool.handler({ id: '507f1f77bcf86cd799439011' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to delete tag');
  });
});
