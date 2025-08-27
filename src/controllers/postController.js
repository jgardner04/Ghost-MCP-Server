import { createPostService } from "../services/postService.js";
import { createContextLogger } from "../utils/logger.js";

/**
 * Controller to handle creating a new post.
 * Assumes input has been validated by middleware.
 * Takes request body containing post data (incl. feature image, metadata)
 * and calls the Post service layer.
 */
const createPost = async (req, res, next) => {
  const logger = createContextLogger('post-controller');
  
  try {
    // Input is already validated by express-validator middleware
    // The body now includes potential feature_image and metadata fields
    const postInput = req.body;

    logger.info('Creating post via service layer', {
      title: postInput.title,
      status: postInput.status,
      hasFeatureImage: !!postInput.feature_image,
      tagCount: postInput.tags?.length || 0
    });
    
    // Call the service layer function
    const newPost = await createPostService(postInput);
    
    logger.info('Post created successfully', {
      postId: newPost.id,
      title: newPost.title,
      status: newPost.status
    });

    res.status(201).json(newPost);
  } catch (error) {
    logger.error('Post creation failed', {
      error: error.message,
      stack: error.stack,
      title: req.body?.title
    });
    // Pass error to the Express error handler
    next(error);
  }
};

export { createPost };
