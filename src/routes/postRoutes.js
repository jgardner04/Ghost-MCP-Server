import express from 'express';
import { body, validationResult } from 'express-validator';
import { createPost } from '../controllers/postController.js';
import { createContextLogger } from '../utils/logger.js';

const router = express.Router();

// Validation middleware for post creation
const validatePostCreation = [
  // Title must exist and be a non-empty string
  body('title').notEmpty().withMessage('Post title is required.').isString(),
  // HTML content must exist and be a non-empty string
  body('html').notEmpty().withMessage('Post HTML content is required.').isString(),
  // Status must be one of the allowed values if provided
  body('status')
    .optional()
    .isIn(['published', 'draft', 'scheduled'])
    .withMessage('Invalid status value.'),
  // custom_excerpt should be a string if provided
  body('custom_excerpt').optional().isString(),
  // published_at should be a valid ISO 8601 date if provided
  body('published_at')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format for published_at (should be ISO 8601).'),
  // tags should be an array if provided
  body('tags').optional().isArray().withMessage('Tags must be an array.'),
  // Add validation for featured image fields (optional)
  body('feature_image').optional().isURL().withMessage('Feature image must be a valid URL.'),
  body('feature_image_alt').optional().isString(),
  body('feature_image_caption').optional().isString(),
  // Add validation for metadata fields (optional strings)
  body('meta_title')
    .optional()
    .isString()
    .isLength({ max: 300 })
    .withMessage('Meta title cannot exceed 300 characters.'),
  body('meta_description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Meta description cannot exceed 500 characters.'),
  // Handle validation results
  (req, res, next) => {
    const logger = createContextLogger('post-routes');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Log the validation errors
      logger.warn('Post validation errors', {
        errors: errors.array(),
        title: req.body?.title,
      });
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

// Define the route for creating a post
// POST /api/posts
// Apply the validation middleware before the controller
router.post('/', validatePostCreation, createPost);

// Add other post-related routes here later (e.g., GET /posts/:id, PUT /posts/:id)

export default router;
