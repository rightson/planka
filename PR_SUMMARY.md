# Pull Request: Transform Image Pasting to File-Based Storage

## Overview

This PR transforms image pasting in card descriptions from base64 data URL embedding to physical file storage on the server, improving performance and maintainability.

## Problem Statement

Currently, when users paste images into card descriptions, they are embedded as base64 data URLs directly in the markdown. This causes:
- Large description field sizes in the database
- Slow rendering of cards with multiple images
- Inefficient storage (base64 encoding adds ~33% overhead)
- No ability to manage or cleanup orphaned images

## Solution

Implement automatic file-based storage for pasted images with:
- Unique, deterministic filenames for traceability
- Database tracking with reference counting
- Automatic migration of legacy base64 images on edit
- Scheduled cleanup of orphaned files

## Key Features

### 1. Automatic File Upload
When users paste images in the markdown editor:
- Image is uploaded to `POST /api/cards/:cardId/inline-images`
- File saved to `public/uploads/` with unique filename
- Database records created for tracking
- Markdown path returned (e.g., `/uploads/card-123-image-...png`)

### 2. Legacy Base64 Migration
When users edit cards containing base64 images:
- Base64 images automatically converted to files
- Database records created
- Markdown updated with file paths
- Original base64 preserved if migration fails

### 3. Reference Counting
- `uploaded_file` table tracks all files with `references_total`
- Files only deleted when reference count reaches zero
- Prevents accidental deletion of shared resources

### 4. Automatic Cleanup
- Scheduled hook runs daily at midnight
- Identifies images not referenced in any card description
- Removes files from filesystem and database
- Configurable via environment variables

## File Structure

### Server-Side Files

**Controllers:**
- `server/api/controllers/inline-images/upload.js` - Handles image upload endpoint

**Helpers:**
- `server/api/helpers/inline-images/process-uploaded-file.js` - Process new uploads
- `server/api/helpers/inline-images/migrate-legacy-images.js` - Convert base64 to files
- `server/api/helpers/inline-images/cleanup-orphaned.js` - Remove unused files
- `server/api/helpers/utils/generate-inline-image-filename.js` - Create unique filenames
- `server/api/helpers/utils/validate-inline-image.js` - Validate MIME type and size

**Models:**
- `server/api/models/InlineImage.js` - Links images to cards

**Hooks:**
- `server/api/hooks/cleanup-inline-images.js` - Automatic scheduled cleanup

**Migrations:**
- `server/db/migrations/20260104000000_add_inline_images.js` - Creates inline_image table

**Documentation:**
- `server/api/helpers/inline-images/README.md` - Architecture documentation

### Client-Side Files

**API:**
- `client/src/api/inline-images.js` - API client for uploading

**Components:**
- `client/src/components/common/MarkdownEditor/MarkdownEditor.jsx` - Add upload handler
- `client/src/components/common/EditMarkdown/EditMarkdown.jsx` - Increase size limit to 20MB
- `client/src/components/cards/CardModal/ProjectContent.jsx` - Pass cardId to editor
- `client/src/components/cards/CardModal/StoryContent.jsx` - Pass cardId to editor

### Configuration Files

**Server:**
- `server/config/custom.js` - Add `inlineImagesPathSegment` config
- `server/config/routes.js` - Add inline images endpoints
- `server/api/controllers/cards/update.js` - Increase description size limit to 20MB
- `server/api/helpers/cards/update-one.js` - Call migration on description update

**Client:**
- `client/vite.config.js` - Suppress build warnings from dependencies

**Other:**
- `public/uploads/.gitkeep` - Track empty uploads directory

## Database Schema

### `inline_image` Table
```sql
CREATE TABLE inline_image (
  id BIGINT PRIMARY KEY DEFAULT next_id(),
  card_id BIGINT NOT NULL,
  uploaded_file_id BIGINT NOT NULL,
  filename TEXT NOT NULL,
  markdown_path TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE INDEX inline_image_card_id_idx ON inline_image(card_id);
CREATE INDEX inline_image_uploaded_file_id_idx ON inline_image(uploaded_file_id);
CREATE INDEX inline_image_markdown_path_idx ON inline_image(markdown_path);
```

## File Naming Convention

Files are named deterministically for traceability:
```
card-{cardId}-image-{timestamp}-{randomSuffix}.{ext}
```

Example: `card-1234567890-image-2026-01-04T12-30-45-a1b2c3d4.png`

- `cardId`: ID of the card containing the image
- `timestamp`: ISO 8601 timestamp (colons replaced by hyphens)
- `randomSuffix`: 8-character crypto-random hex string
- `ext`: File extension based on detected MIME type

## Security Considerations

- **MIME type validation**: Only image types allowed (png, jpg, jpeg, gif, webp, avif)
- **File size limits**: 10MB default prevents abuse
- **Content detection**: Uses `file-type` library to verify actual file content
- **Unique filenames**: Crypto-random suffixes prevent collisions
- **Reference counting**: Automatic cleanup when no longer referenced
- **Table existence checks**: Gracefully handles missing database table

## Configuration

### Environment Variables

**Cleanup Schedule (Optional):**
```bash
# Disable automatic cleanup
CLEANUP_INLINE_IMAGES_ENABLED=false

# Change schedule (run every 6 hours instead of daily)
CLEANUP_INLINE_IMAGES_CRON="0 */6 * * *"
```

### Custom Config

In `server/config/custom.js`:
```javascript
inlineImagesPathSegment: 'public/uploads'
```

## Migration Guide

### 1. Run Database Migration
```bash
npm run server:db:migrate
```

This creates the `inline_image` table.

### 2. Restart Server
```bash
npm run server:start
```

### 3. Test Image Pasting
- Open a card
- Paste an image in the description
- Image should upload and display as a file URL

### 4. Legacy Migration
- Edit any card with existing base64 images
- Base64 images automatically converted to files

## Backwards Compatibility

- ✅ Fully backward compatible
- ✅ Existing base64 images continue to work
- ✅ Base64 images automatically migrated on first edit
- ✅ Feature gracefully disabled if table doesn't exist
- ✅ Falls back to base64 if upload fails

## Testing Checklist

- [ ] Upload new image by pasting in description
- [ ] Edit card with base64 image (should auto-migrate)
- [ ] Delete image from description (should be cleaned up within 24h)
- [ ] Verify files created in `public/uploads/`
- [ ] Verify database records in `inline_image` table
- [ ] Check cleanup runs daily (logs at midnight)
- [ ] Test with S3 storage (if configured)

## Performance Improvements

- **Database size**: Base64 removed from descriptions (~33% reduction per image)
- **Query performance**: Smaller description fields improve SELECT queries
- **Rendering speed**: Browser caches image files vs. re-parsing base64
- **Network efficiency**: Images can be served with CDN/caching headers

## Future Enhancements (Not in this PR)

- Image compression/optimization during upload
- Thumbnail generation for large images
- Drag-and-drop image upload
- Copy-paste from clipboard with metadata
- Batch cleanup via admin interface

## Breaking Changes

**None** - This PR is fully backward compatible.

## Rollback Procedure

If needed, rollback the database migration:
```bash
cd server
npx knex migrate:rollback --cwd db
```

Then redeploy the previous version of the code.

## Credits

Implemented based on production-grade requirements for file-based image storage in Planka card descriptions.
