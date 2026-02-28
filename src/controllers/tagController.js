import { getTags as getGhostTags, createTag as createGhostTag } from '../services/ghostService.js';
import { createContextLogger } from '../utils/logger.js';
import { tagQuerySchema } from '../schemas/tagSchemas.js';
import { ZodError } from 'zod';

/**
 * Controller to handle fetching tags.
 * Can optionally filter by tag name via query parameter.
 */
const getTags = async (req, res, next) => {
  const logger = createContextLogger('tag-controller');

  try {
    // Validate query parameters using Zod schema
    const validatedQuery = tagQuerySchema.parse(req.query);

    // Build options object
    const options = {};

    // Handle legacy name parameter by converting to filter
    if (validatedQuery.name) {
      // Escape single quotes and backslashes to prevent injection
      const safeName = validatedQuery.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      options.filter = `name:'${safeName}'`;
    }

    // Add other query parameters
    if (validatedQuery.limit) options.limit = validatedQuery.limit;
    if (validatedQuery.filter) options.filter = validatedQuery.filter;
    if (validatedQuery.order) options.order = validatedQuery.order;
    if (validatedQuery.include) options.include = validatedQuery.include;

    logger.info('Fetching tags', {
      options,
    });

    const tags = await getGhostTags(options);

    logger.info('Tags retrieved successfully', {
      count: tags.length,
    });

    res.status(200).json(tags);
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn('Invalid query parameters', { errors: error.issues });
      return res.status(400).json({
        message: 'Invalid query parameters',
        errors: error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })),
      });
    }

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
