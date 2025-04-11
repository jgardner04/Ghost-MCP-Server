import {
  getTags as getGhostTags,
  createTag as createGhostTag,
} from "../services/ghostService.js";

/**
 * Controller to handle fetching tags.
 * Can optionally filter by tag name via query parameter.
 */
const getTags = async (req, res, next) => {
  try {
    const { name } = req.query; // Get name from query params like /api/tags?name=some-tag
    console.log(
      `Fetching tags${name ? ' matching name "' + name + '"' : ""}...`
    );
    const tags = await getGhostTags(name);
    res.status(200).json(tags);
  } catch (error) {
    console.error("Error in getTags controller:", error.message);
    next(error);
  }
};

/**
 * Controller to handle creating a new tag.
 */
const createTag = async (req, res, next) => {
  try {
    // Basic validation (more could be added via express-validator)
    const { name, description, slug, ...otherData } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Tag name is required." });
    }
    const tagData = { name, description, slug, ...otherData };

    console.log("Creating tag with data:", tagData);
    const newTag = await createGhostTag(tagData);
    console.log("Successfully created tag:", newTag.id);
    res.status(201).json(newTag);
  } catch (error) {
    console.error("Error in createTag controller:", error.message);
    next(error);
  }
};

// Add controllers for other CRUD operations (getTagById, updateTag, deleteTag) if needed later

export { getTags, createTag };
