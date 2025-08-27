import express from "express";
import { body, validationResult } from "express-validator"; // Import for validation
import { getTags, createTag } from "../controllers/tagController.js";
import { createContextLogger } from "../utils/logger.js";

const router = express.Router();

// Validation middleware for tag creation
const validateTagCreation = [
  body("name").notEmpty().withMessage("Tag name is required.").isString(),
  body("description")
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage("Tag description cannot exceed 500 characters."),
  body("slug")
    .optional()
    .isString()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage(
      "Tag slug can only contain lower-case letters, numbers, and hyphens."
    ),
  // Handle validation results
  (req, res, next) => {
    const logger = createContextLogger('tag-routes');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Tag validation errors', {
        errors: errors.array(),
        tagName: req.body?.name
      });
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

// Define routes
// GET /api/tags (supports ?name=... query for filtering)
router.get("/", getTags);

// POST /api/tags
router.post("/", validateTagCreation, createTag);

// Add routes for other CRUD operations (GET /:id, PUT /:id, DELETE /:id) later if needed

export default router;
