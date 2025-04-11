import { MCPServer, Resource, Tool } from "@modelcontextprotocol/sdk";
import dotenv from "dotenv";
import { createPostService } from "./services/postService.js";
import {
  uploadImage as uploadGhostImage,
  getTags as getGhostTags,
  createTag as createGhostTag,
} from "./services/ghostService.js";
import { processImage } from "./services/imageProcessingService.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

// Load environment variables (might be redundant if loaded elsewhere, but safe)
dotenv.config();

console.log("Initializing MCP Server...");

// Define the server instance
const mcpServer = new MCPServer({
  metadata: {
    name: "Ghost CMS Manager",
    description:
      "MCP Server to manage a Ghost CMS instance using the Admin API.",
    // iconUrl: '...',
  },
});

// --- Define Resources ---

console.log("Defining MCP Resources...");

// Ghost Tag Resource
const ghostTagResource = new Resource({
  name: "ghost/tag",
  description: "Represents a tag in Ghost CMS.",
  schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique ID of the tag" },
      name: { type: "string", description: "The name of the tag" },
      slug: { type: "string", description: "URL-friendly version of the name" },
      description: {
        type: ["string", "null"],
        description: "Optional description for the tag",
      },
      // Add other relevant tag fields if needed (e.g., feature_image, visibility)
    },
    required: ["id", "name", "slug"],
  },
});
mcpServer.addResource(ghostTagResource);
console.log(`Added Resource: ${ghostTagResource.name}`);

// Ghost Post Resource
const ghostPostResource = new Resource({
  name: "ghost/post",
  description: "Represents a post in Ghost CMS.",
  schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique ID of the post" },
      uuid: { type: "string", description: "UUID of the post" },
      title: { type: "string", description: "The title of the post" },
      slug: {
        type: "string",
        description: "URL-friendly version of the title",
      },
      html: {
        type: ["string", "null"],
        description: "The post content as HTML",
      },
      plaintext: {
        type: ["string", "null"],
        description: "The post content as plain text",
      },
      feature_image: {
        type: ["string", "null"],
        description: "URL of the featured image",
      },
      feature_image_alt: {
        type: ["string", "null"],
        description: "Alt text for the featured image",
      },
      feature_image_caption: {
        type: ["string", "null"],
        description: "Caption for the featured image",
      },
      featured: {
        type: "boolean",
        description: "Whether the post is featured",
      },
      status: {
        type: "string",
        enum: ["published", "draft", "scheduled"],
        description: "Publication status",
      },
      visibility: {
        type: "string",
        enum: ["public", "members", "paid"],
        description: "Access level",
      },
      created_at: {
        type: "string",
        format: "date-time",
        description: "Date/time post was created",
      },
      updated_at: {
        type: "string",
        format: "date-time",
        description: "Date/time post was last updated",
      },
      published_at: {
        type: ["string", "null"],
        format: "date-time",
        description: "Date/time post was published or scheduled",
      },
      custom_excerpt: {
        type: ["string", "null"],
        description: "Custom excerpt for the post",
      },
      meta_title: { type: ["string", "null"], description: "Custom SEO title" },
      meta_description: {
        type: ["string", "null"],
        description: "Custom SEO description",
      },
      tags: {
        type: "array",
        description: "Tags associated with the post",
        items: { $ref: "#/definitions/ghost/tag" }, // Reference the ghost/tag resource
      },
      // Add authors or other relevant fields if needed
    },
    required: [
      "id",
      "uuid",
      "title",
      "slug",
      "status",
      "visibility",
      "created_at",
      "updated_at",
    ],
    definitions: {
      // Make the referenced tag resource available within this schema's scope
      "ghost/tag": ghostTagResource.schema,
    },
  },
});
mcpServer.addResource(ghostPostResource);
console.log(`Added Resource: ${ghostPostResource.name}`);

// --- Define Tools (Subtasks 8.4 - 8.7) ---
// Placeholder comments for where tools will be added

// --- End Resource/Tool Definitions ---

console.log("Defining MCP Tools...");

// Create Post Tool (Adding this missing tool)
const createPostTool = new Tool({
  name: "ghost_create_post",
  description:
    "Creates a new post in Ghost CMS. Handles tag creation/lookup. Returns the created post data.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "The title for the new post." },
      html: {
        type: "string",
        description: "The HTML content for the new post.",
      },
      status: {
        type: "string",
        enum: ["published", "draft", "scheduled"],
        default: "draft",
        description:
          "The status for the post (published, draft, scheduled). Defaults to draft.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional: An array of tag names (strings) to associate with the post.",
      },
      published_at: {
        type: "string",
        format: "date-time",
        description:
          "Optional: The ISO 8601 date/time for publishing or scheduling. Required if status is scheduled.",
      },
      custom_excerpt: {
        type: "string",
        description: "Optional: A custom short summary for the post.",
      },
      feature_image: {
        type: "string",
        format: "url",
        description:
          "Optional: URL of the image (e.g., from ghost_upload_image tool) to use as the featured image.",
      },
      feature_image_alt: {
        type: "string",
        description: "Optional: Alt text for the featured image.",
      },
      feature_image_caption: {
        type: "string",
        description: "Optional: Caption for the featured image.",
      },
      meta_title: {
        type: "string",
        description:
          "Optional: Custom title for SEO (max 300 chars). Defaults to post title if omitted.",
      },
      meta_description: {
        type: "string",
        description:
          "Optional: Custom description for SEO (max 500 chars). Defaults to excerpt or generated summary if omitted.",
      },
    },
    required: ["title", "html"],
  },
  outputSchema: {
    $ref: "ghost/post#/schema",
  },
  implementation: async (input) => {
    console.log(
      `Executing tool: ${createPostTool.name} with input keys:`,
      Object.keys(input)
    );
    try {
      const createdPost = await createPostService(input);
      console.log(
        `Tool ${createPostTool.name} executed successfully. Post ID: ${createdPost.id}`
      );
      return createdPost;
    } catch (error) {
      console.error(`Error executing tool ${createPostTool.name}:`, error);
      throw new Error(`Failed to create Ghost post: ${error.message}`);
    }
  },
});
mcpServer.addTool(createPostTool);
console.log(`Added Tool: ${createPostTool.name}`);

// Upload Image Tool
const uploadImageTool = new Tool({
  name: "ghost_upload_image",
  description:
    "Downloads an image from a URL, processes it, uploads it to Ghost CMS, and returns the final Ghost image URL and alt text.",
  inputSchema: {
    type: "object",
    properties: {
      imageUrl: {
        type: "string",
        format: "url",
        description: "The publicly accessible URL of the image to upload.",
      },
      alt: {
        type: "string",
        description:
          "Optional: Alt text for the image. If omitted, a default will be generated from the filename.",
      },
      // filenameHint: { type: 'string', description: 'Optional: A hint for the original filename, used for default alt text generation.' }
    },
    required: ["imageUrl"],
  },
  outputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        format: "url",
        description: "The final URL of the image hosted on Ghost.",
      },
      alt: {
        type: "string",
        description: "The alt text determined for the image.",
      },
    },
    required: ["url", "alt"],
  },
  implementation: async (input) => {
    console.log(
      `Executing tool: ${uploadImageTool.name} for URL:`,
      input.imageUrl
    );
    const { imageUrl, alt } = input;
    let downloadedPath = null;
    let processedPath = null;

    try {
      // --- 1. Download the image ---
      const response = await axios({ url: imageUrl, responseType: "stream" });
      // Generate a unique temporary filename
      const tempDir = os.tmpdir();
      const extension = path.extname(imageUrl.split("?")[0]) || ".tmp"; // Basic extension extraction
      const originalFilenameHint =
        path.basename(imageUrl.split("?")[0]) ||
        `image-${uuidv4()}${extension}`;
      downloadedPath = path.join(
        tempDir,
        `mcp-download-${uuidv4()}${extension}`
      );

      const writer = fs.createWriteStream(downloadedPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      console.log(`Downloaded image to temporary path: ${downloadedPath}`);

      // --- 2. Process the image (Optional) ---
      // Using the service from subtask 4.2
      processedPath = await processImage(downloadedPath, tempDir);
      console.log(`Processed image path: ${processedPath}`);

      // --- 3. Determine Alt Text ---
      // Using similar logic from subtask 4.4
      const defaultAlt = getDefaultAltText(originalFilenameHint);
      const finalAltText = alt || defaultAlt;
      console.log(`Using alt text: "${finalAltText}"`);

      // --- 4. Upload processed image to Ghost ---
      const uploadResult = await uploadGhostImage(processedPath);
      console.log(`Uploaded processed image to Ghost: ${uploadResult.url}`);

      // --- 5. Return result ---
      return {
        url: uploadResult.url,
        alt: finalAltText,
      };
    } catch (error) {
      console.error(`Error executing tool ${uploadImageTool.name}:`, error);
      // Add more specific error handling (download failed, processing failed, upload failed)
      throw new Error(
        `Failed to upload image from URL ${imageUrl}: ${error.message}`
      );
    } finally {
      // --- 6. Cleanup temporary files ---
      if (downloadedPath) {
        fs.unlink(downloadedPath, (err) => {
          if (err)
            console.error(
              "Error deleting temporary downloaded file:",
              downloadedPath,
              err
            );
        });
      }
      if (processedPath && processedPath !== downloadedPath) {
        fs.unlink(processedPath, (err) => {
          if (err)
            console.error(
              "Error deleting temporary processed file:",
              processedPath,
              err
            );
        });
      }
    }
  },
});

// Helper function for default alt text (similar to imageController)
const getDefaultAltText = (filePath) => {
  try {
    const originalFilename = path
      .basename(filePath)
      .split(".")
      .slice(0, -1)
      .join(".");
    const nameWithoutIds = originalFilename
      .replace(/^(processed-|mcp-download-|mcp-upload-)\d+-\d+-?/, "")
      .replace(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-?/, ""); // Remove UUIDs too
    return nameWithoutIds.replace(/[-_]/g, " ").trim() || "Uploaded image";
  } catch (e) {
    return "Uploaded image";
  }
};

mcpServer.addTool(uploadImageTool);
console.log(`Added Tool: ${uploadImageTool.name}`);

// Get Tags Tool
const getTagsTool = new Tool({
  name: "ghost_get_tags",
  description:
    "Retrieves a list of tags from Ghost CMS. Can optionally filter by tag name.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Optional: The exact name of the tag to search for.",
      },
    },
  },
  outputSchema: {
    type: "array",
    items: { $ref: "ghost/tag#/schema" }, // Output is an array of ghost/tag resources
  },
  implementation: async (input) => {
    console.log(`Executing tool: ${getTagsTool.name} with input:`, input);
    try {
      const tags = await getGhostTags(input?.name); // Pass name if provided
      console.log(
        `Tool ${getTagsTool.name} executed successfully. Found ${tags.length} tags.`
      );
      // TODO: Validate/map output against schema if necessary
      return tags;
    } catch (error) {
      console.error(`Error executing tool ${getTagsTool.name}:`, error);
      throw new Error(`Failed to get Ghost tags: ${error.message}`);
    }
  },
});
mcpServer.addTool(getTagsTool);
console.log(`Added Tool: ${getTagsTool.name}`);

// Create Tag Tool
const createTagTool = new Tool({
  name: "ghost_create_tag",
  description: "Creates a new tag in Ghost CMS. Returns the created tag.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The name for the new tag." },
      description: {
        type: "string",
        description: "Optional: A description for the tag (max 500 chars).",
      },
      slug: {
        type: "string",
        description:
          "Optional: A URL-friendly slug. If omitted, Ghost generates one from the name.",
      },
      // Add other createable fields like color, feature_image etc. if needed
    },
    required: ["name"],
  },
  outputSchema: {
    $ref: "ghost/tag#/schema", // Output is a single ghost/tag resource
  },
  implementation: async (input) => {
    console.log(`Executing tool: ${createTagTool.name} with input:`, input);
    try {
      // Basic validation happens via inputSchema, more specific validation (like slug format) could be added here if not in service
      const newTag = await createGhostTag(input);
      console.log(
        `Tool ${createTagTool.name} executed successfully. Tag ID: ${newTag.id}`
      );
      // TODO: Validate/map output against schema if necessary
      return newTag;
    } catch (error) {
      console.error(`Error executing tool ${createTagTool.name}:`, error);
      throw new Error(`Failed to create Ghost tag: ${error.message}`);
    }
  },
});
mcpServer.addTool(createTagTool);
console.log(`Added Tool: ${createTagTool.name}`);

// --- End Tool Definitions ---

// Function to start the MCP server
// We might integrate this with the Express server later or run separately
const startMCPServer = async (port = 3001) => {
  try {
    // Ensure resources/tools are added before starting
    console.log("Starting MCP Server on port", port);
    await mcpServer.listen({ port });
    console.log(`MCP Server listening on port ${port}`);
    console.log(
      "Available Resources:",
      mcpServer.listResources().map((r) => r.name)
    );
    console.log(
      "Available Tools:",
      mcpServer.listTools().map((t) => t.name)
    );
  } catch (error) {
    console.error("Failed to start MCP Server:", error);
    process.exit(1);
  }
};

// Export the server instance and start function if needed elsewhere
export { mcpServer, startMCPServer };

// Optional: Automatically start if this file is run directly
// This might conflict if we integrate with Express later
// if (require.main === module) {
//   startMCPServer();
// }
