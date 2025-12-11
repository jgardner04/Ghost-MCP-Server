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
const mockCreateTag = vi.fn();
const mockUploadImage = vi.fn();
const mockCreatePostService = vi.fn();
const mockProcessImage = vi.fn();
const mockValidateImageUrl = vi.fn();
const mockCreateSecureAxiosConfig = vi.fn();
const mockUpdatePost = vi.fn();
const mockDeletePost = vi.fn();

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

vi.mock('../services/ghostServiceImproved.js', () => ({
  updatePost: (...args) => mockUpdatePost(...args),
  deletePost: (...args) => mockDeletePost(...args),
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

describe('mcp_server_improved - ghost_get_posts tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    // Import the module to register tools (only first time)
    if (mockTools.size === 0) {
      await import('../mcp_server_improved.js');
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
    expect(tool.schema.limit).toBeDefined();
    expect(tool.schema.page).toBeDefined();
    expect(tool.schema.status).toBeDefined();
    expect(tool.schema.include).toBeDefined();
    expect(tool.schema.filter).toBeDefined();
    expect(tool.schema.order).toBeDefined();
  });

  it('should retrieve posts with default options', async () => {
    const mockPosts = [
      { id: '1', title: 'Post 1', slug: 'post-1', status: 'published' },
      { id: '2', title: 'Post 2', slug: 'post-2', status: 'draft' },
    ];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    const result = await tool.handler({});

    expect(mockGetPosts).toHaveBeenCalledWith({});
    expect(result.content[0].text).toContain('Post 1');
    expect(result.content[0].text).toContain('Post 2');
  });

  it('should pass limit and page parameters', async () => {
    const mockPosts = [{ id: '1', title: 'Post 1', slug: 'post-1' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ limit: 10, page: 2 });

    expect(mockGetPosts).toHaveBeenCalledWith({ limit: 10, page: 2 });
  });

  it('should validate limit is between 1 and 100', () => {
    const tool = mockTools.get('ghost_get_posts');
    const schema = tool.schema;

    // Test that limit schema exists and has proper validation
    expect(schema.limit).toBeDefined();
    expect(() => schema.limit.parse(0)).toThrow();
    expect(() => schema.limit.parse(101)).toThrow();
    expect(schema.limit.parse(50)).toBe(50);
  });

  it('should validate page is at least 1', () => {
    const tool = mockTools.get('ghost_get_posts');
    const schema = tool.schema;

    expect(schema.page).toBeDefined();
    expect(() => schema.page.parse(0)).toThrow();
    expect(schema.page.parse(1)).toBe(1);
  });

  it('should pass status filter', async () => {
    const mockPosts = [{ id: '1', title: 'Published Post', status: 'published' }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ status: 'published' });

    expect(mockGetPosts).toHaveBeenCalledWith({ status: 'published' });
  });

  it('should validate status enum values', () => {
    const tool = mockTools.get('ghost_get_posts');
    const schema = tool.schema;

    expect(schema.status).toBeDefined();
    expect(() => schema.status.parse('invalid')).toThrow();
    expect(schema.status.parse('published')).toBe('published');
    expect(schema.status.parse('draft')).toBe('draft');
    expect(schema.status.parse('scheduled')).toBe('scheduled');
    expect(schema.status.parse('all')).toBe('all');
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

    expect(mockGetPosts).toHaveBeenCalledWith({ include: 'tags,authors' });
  });

  it('should pass filter parameter (NQL)', async () => {
    const mockPosts = [{ id: '1', title: 'Featured Post', featured: true }];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ filter: 'featured:true' });

    expect(mockGetPosts).toHaveBeenCalledWith({ filter: 'featured:true' });
  });

  it('should pass order parameter', async () => {
    const mockPosts = [
      { id: '1', title: 'Newest', published_at: '2025-12-10' },
      { id: '2', title: 'Older', published_at: '2025-12-01' },
    ];
    mockGetPosts.mockResolvedValue(mockPosts);

    const tool = mockTools.get('ghost_get_posts');
    await tool.handler({ order: 'published_at DESC' });

    expect(mockGetPosts).toHaveBeenCalledWith({ order: 'published_at DESC' });
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
    });

    expect(mockGetPosts).toHaveBeenCalledWith({
      limit: 20,
      page: 1,
      status: 'published',
      include: 'tags,authors',
      filter: 'featured:true',
      order: 'published_at DESC',
    });
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

describe('mcp_server_improved - ghost_get_post tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server_improved.js');
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
    expect(tool.schema.id).toBeDefined();
    expect(tool.schema.slug).toBeDefined();
    expect(tool.schema.include).toBeDefined();
  });

  it('should retrieve post by ID', async () => {
    const mockPost = {
      id: '123',
      title: 'Test Post',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ id: '123' });

    expect(mockGetPost).toHaveBeenCalledWith('123', {});
    expect(result.content[0].text).toContain('"id": "123"');
    expect(result.content[0].text).toContain('"title": "Test Post"');
  });

  it('should retrieve post by slug', async () => {
    const mockPost = {
      id: '123',
      title: 'Test Post',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ slug: 'test-post' });

    expect(mockGetPost).toHaveBeenCalledWith('slug/test-post', {});
    expect(result.content[0].text).toContain('"title": "Test Post"');
  });

  it('should pass include parameter with ID', async () => {
    const mockPost = {
      id: '123',
      title: 'Post with relations',
      tags: [{ name: 'tech' }],
      authors: [{ name: 'John' }],
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    await tool.handler({ id: '123', include: 'tags,authors' });

    expect(mockGetPost).toHaveBeenCalledWith('123', { include: 'tags,authors' });
  });

  it('should pass include parameter with slug', async () => {
    const mockPost = {
      id: '123',
      title: 'Post with relations',
      slug: 'test-post',
      tags: [{ name: 'tech' }],
    };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    await tool.handler({ slug: 'test-post', include: 'tags' });

    expect(mockGetPost).toHaveBeenCalledWith('slug/test-post', { include: 'tags' });
  });

  it('should prefer ID over slug when both provided', async () => {
    const mockPost = { id: '123', title: 'Test Post', slug: 'test-post' };
    mockGetPost.mockResolvedValue(mockPost);

    const tool = mockTools.get('ghost_get_post');
    await tool.handler({ id: '123', slug: 'wrong-slug' });

    expect(mockGetPost).toHaveBeenCalledWith('123', {});
  });

  it('should handle not found errors', async () => {
    mockGetPost.mockRejectedValue(new Error('Post not found'));

    const tool = mockTools.get('ghost_get_post');
    const result = await tool.handler({ id: 'nonexistent' });

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
      id: '1',
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
    const result = await tool.handler({ id: '1' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "1"');
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

describe('mcp_server_improved - ghost_update_post tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server_improved.js');
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
    expect(tool.schema.id).toBeDefined();
    expect(tool.schema.title).toBeDefined();
    expect(tool.schema.html).toBeDefined();
    expect(tool.schema.status).toBeDefined();
    expect(tool.schema.tags).toBeDefined();
    expect(tool.schema.feature_image).toBeDefined();
    expect(tool.schema.feature_image_alt).toBeDefined();
    expect(tool.schema.feature_image_caption).toBeDefined();
    expect(tool.schema.meta_title).toBeDefined();
    expect(tool.schema.meta_description).toBeDefined();
    expect(tool.schema.published_at).toBeDefined();
    expect(tool.schema.custom_excerpt).toBeDefined();
  });

  it('should update post title', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Updated Title',
      slug: 'test-post',
      html: '<p>Content</p>',
      status: 'published',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '123', title: 'Updated Title' });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', { title: 'Updated Title' });
    expect(result.content[0].text).toContain('"title": "Updated Title"');
  });

  it('should update post content', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Test Post',
      html: '<p>Updated content</p>',
      status: 'published',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '123', html: '<p>Updated content</p>' });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', { html: '<p>Updated content</p>' });
    expect(result.content[0].text).toContain('Updated content');
  });

  it('should update post status', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Test Post',
      html: '<p>Content</p>',
      status: 'published',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '123', status: 'published' });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', { status: 'published' });
    expect(result.content[0].text).toContain('"status": "published"');
  });

  it('should update post tags', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Test Post',
      html: '<p>Content</p>',
      tags: [{ name: 'tech' }, { name: 'javascript' }],
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '123', tags: ['tech', 'javascript'] });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', { tags: ['tech', 'javascript'] });
    expect(result.content[0].text).toContain('tech');
    expect(result.content[0].text).toContain('javascript');
  });

  it('should update post featured image', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Test Post',
      feature_image: 'https://example.com/new-image.jpg',
      feature_image_alt: 'New image',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '123',
      feature_image: 'https://example.com/new-image.jpg',
      feature_image_alt: 'New image',
    });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', {
      feature_image: 'https://example.com/new-image.jpg',
      feature_image_alt: 'New image',
    });
    expect(result.content[0].text).toContain('new-image.jpg');
  });

  it('should update SEO meta fields', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Test Post',
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '123',
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
    });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', {
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
    });
    expect(result.content[0].text).toContain('SEO Title');
    expect(result.content[0].text).toContain('SEO Description');
  });

  it('should update multiple fields at once', async () => {
    const mockUpdatedPost = {
      id: '123',
      title: 'Updated Title',
      html: '<p>Updated content</p>',
      status: 'published',
      tags: [{ name: 'tech' }],
      updated_at: '2025-12-10T12:00:00.000Z',
    };
    mockUpdatePost.mockResolvedValue(mockUpdatedPost);

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({
      id: '123',
      title: 'Updated Title',
      html: '<p>Updated content</p>',
      status: 'published',
      tags: ['tech'],
    });

    expect(mockUpdatePost).toHaveBeenCalledWith('123', {
      title: 'Updated Title',
      html: '<p>Updated content</p>',
      status: 'published',
      tags: ['tech'],
    });
    expect(result.content[0].text).toContain('Updated Title');
  });

  it('should handle not found errors', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Post not found'));

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: 'nonexistent', title: 'New Title' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Post not found');
  });

  it('should handle validation errors', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Validation failed: Title is required'));

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '123', title: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation failed');
  });

  it('should handle Ghost API errors', async () => {
    mockUpdatePost.mockRejectedValue(new Error('Ghost API error: Server timeout'));

    const tool = mockTools.get('ghost_update_post');
    const result = await tool.handler({ id: '123', title: 'Updated' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return formatted JSON response', async () => {
    const mockUpdatedPost = {
      id: '123',
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
    const result = await tool.handler({ id: '123', title: 'Updated Post' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('"id": "123"');
    expect(result.content[0].text).toContain('"title": "Updated Post"');
    expect(result.content[0].text).toContain('"status": "published"');
  });
});

describe('mcp_server_improved - ghost_delete_post tool', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Don't clear mockTools - they're registered once on module load
    if (mockTools.size === 0) {
      await import('../mcp_server_improved.js');
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
    expect(tool.schema.id).toBeDefined();
  });

  it('should delete post by ID', async () => {
    mockDeletePost.mockResolvedValue({ deleted: true });

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '123' });

    expect(mockDeletePost).toHaveBeenCalledWith('123');
    expect(result.content[0].text).toContain('Post 123 has been successfully deleted');
    expect(result.isError).toBeUndefined();
  });

  it('should handle not found errors', async () => {
    mockDeletePost.mockRejectedValue(new Error('Post not found'));

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: 'nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Post not found');
  });

  it('should handle Ghost API errors', async () => {
    mockDeletePost.mockRejectedValue(new Error('Ghost API error: Permission denied'));

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ghost API error');
  });

  it('should return success message on successful deletion', async () => {
    mockDeletePost.mockResolvedValue({ deleted: true });

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: 'test-post-id' });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Post test-post-id has been successfully deleted.');
  });

  it('should handle network errors', async () => {
    mockDeletePost.mockRejectedValue(new Error('Network error: Connection refused'));

    const tool = mockTools.get('ghost_delete_post');
    const result = await tool.handler({ id: '123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });
});
