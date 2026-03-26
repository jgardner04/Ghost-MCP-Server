/**
 * Barrel re-export for backward compatibility.
 *
 * The implementation has been split into focused modules:
 *   - ghostApiClient.js  — API client, circuit breaker, retry logic, CRUD helpers
 *   - validators.js      — Input validation helpers
 *   - posts.js           — Post CRUD operations
 *   - pages.js           — Page CRUD operations
 *   - tags.js            — Tag CRUD operations
 *   - members.js         — Member CRUD operations
 *   - newsletters.js     — Newsletter CRUD operations
 *   - tiers.js           — Tier CRUD operations
 *   - images.js          — Image upload
 */

// Infrastructure
export {
  api,
  ghostCircuitBreaker,
  handleApiRequest,
  readResource,
  updateWithOCC,
  deleteResource,
  getSiteInfo,
  checkHealth,
} from './ghostApiClient.js';

// Validators
export { validators } from './validators.js';

// Posts
export { createPost, updatePost, deletePost, getPost, getPosts, searchPosts } from './posts.js';

// Pages
export { createPage, updatePage, deletePage, getPage, getPages, searchPages } from './pages.js';

// Tags
export { createTag, getTags, getTag, updateTag, deleteTag } from './tags.js';

// Members
export {
  createMember,
  updateMember,
  deleteMember,
  getMembers,
  getMember,
  searchMembers,
} from './members.js';

// Newsletters
export {
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
} from './newsletters.js';

// Tiers
export { createTier, updateTier, deleteTier, getTiers, getTier } from './tiers.js';

// Images
export { uploadImage } from './images.js';

// Re-import for default export object
import { getSiteInfo, checkHealth } from './ghostApiClient.js';
import { createPost, updatePost, deletePost, getPost, getPosts, searchPosts } from './posts.js';
import { createPage, updatePage, deletePage, getPage, getPages, searchPages } from './pages.js';
import { createTag, getTags, getTag, updateTag, deleteTag } from './tags.js';
import {
  createMember,
  updateMember,
  deleteMember,
  getMembers,
  getMember,
  searchMembers,
} from './members.js';
import {
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
} from './newsletters.js';
import { createTier, updateTier, deleteTier, getTiers, getTier } from './tiers.js';
import { uploadImage } from './images.js';

export default {
  getSiteInfo,
  createPost,
  updatePost,
  deletePost,
  getPost,
  getPosts,
  searchPosts,
  createPage,
  updatePage,
  deletePage,
  getPage,
  getPages,
  searchPages,
  uploadImage,
  createTag,
  getTags,
  getTag,
  updateTag,
  deleteTag,
  createMember,
  updateMember,
  deleteMember,
  getMembers,
  getMember,
  searchMembers,
  getNewsletters,
  getNewsletter,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  createTier,
  updateTier,
  deleteTier,
  getTiers,
  getTier,
  checkHealth,
};
