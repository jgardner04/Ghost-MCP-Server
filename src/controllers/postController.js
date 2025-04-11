import { createPostService } from "../services/postService.js";

/**
 * Controller to handle creating a new post.
 * Assumes input has been validated by middleware.
 * Takes request body containing post data (incl. feature image, metadata)
 * and calls the Post service layer.
 */
const createPost = async (req, res, next) => {
  try {
    // Input is already validated by express-validator middleware
    // The body now includes potential feature_image and metadata fields
    const postInput = req.body;

    console.log("Calling postService.createPostService with input:", postInput);
    // Call the service layer function
    const newPost = await createPostService(postInput);
    console.log("Successfully created post via service layer:", newPost.id);

    res.status(201).json(newPost);
  } catch (error) {
    console.error("Error in createPost controller:", error.message);
    // Pass error to the Express error handler
    next(error);
  }
};

export { createPost };
