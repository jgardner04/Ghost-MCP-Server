import { getTags as getGhostTags, createTag as createGhostTag } from '../services/ghostService.js';
import { createContextLogger } from '../utils/logger.js';

/**
 * Controller to handle fetching tags.
 * Can optionally filter by tag name via query parameter.
 */
const getTags = async (req, res, next) => {
  const logger = createContextLogger('tag-controller');

  try {
    const { name, limit, filter, order, include } = req.query;

    // Build options object
    const options = {};

    // Handle legacy name parameter by converting to filter
    if (name) {
      // Validate and sanitize name
      if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
        logger.warn('Tag name contains invalid characters', { name });
        return res.status(400).json({ message: 'Tag name contains invalid characters' });
      }
      // Escape single quotes and backslashes to prevent injection
      const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      options.filter = `name:'${safeName}'`;
    }

    // Add other query parameters
    if (limit) options.limit = limit;
    if (filter) options.filter = filter; // This will override name-based filter if both provided
    if (order) options.order = order;
    if (include) options.include = include;

    logger.info('Fetching tags', {
      options,
    });

    const tags = await getGhostTags(options);

    logger.info('Tags retrieved successfully', {
      count: tags.length,
    });

    res.status(200).json(tags);
  } catch (error) {
    logger.error('Get tags failed', {
      error: error.message,
      query: req.query,
    });
    next(error);
  }
};

/**
 * Controller to handle creating a new tag.
 */
const createTag = async (req, res, next) => {
  const logger = createContextLogger('tag-controller');

  try {
    // Basic validation (more could be added via express-validator)
    const { name, description, slug, ...otherData } = req.body;
    if (!name) {
      logger.warn('Tag creation attempted without name');
      return res.status(400).json({ message: 'Tag name is required.' });
    }
    const tagData = { name, description, slug, ...otherData };

    logger.info('Creating tag', {
      name,
      hasDescription: !!description,
      hasSlug: !!slug,
    });

    const newTag = await createGhostTag(tagData);

    logger.info('Tag created successfully', {
      tagId: newTag.id,
      name: newTag.name,
      slug: newTag.slug,
    });

    res.status(201).json(newTag);
  } catch (error) {
    logger.error('Tag creation failed', {
      error: error.message,
      tagName: req.body?.name,
    });
    next(error);
  }
};

// Add controllers for other CRUD operations (getTagById, updateTag, deleteTag) if needed later

export { getTags, createTag };
