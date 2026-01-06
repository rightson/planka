# Inline Images Storage Architecture

## Overview

This feature transforms image pasting in card descriptions from base64 data URLs to physical file storage on the server. All files are tracked in the database with proper referencing.

## File Storage Strategy

### 1. Storage Locations

- **Inline Images**: `public/uploads/` - Small images embedded in card descriptions
  - Size limit: Respects global MAX_UPLOAD_FILE_SIZE (default 10MB if not set)
  - Publicly accessible for display in markdown
  - Examples: Screenshots, diagrams pasted into descriptions

- **File Attachments**: `private/attachments/` - Large file attachments
  - Size limit: Respects global MAX_UPLOAD_FILE_SIZE
  - Access controlled via download endpoints
  - Examples: Documents, large files attached to cards

### 2. Database Tracking

All files are tracked in the database:

#### `uploaded_file` table
- Stores metadata for ALL uploaded files (both attachments and inline images)
- Fields: `id`, `mime_type`, `size`, `type`, `references_total`
- `references_total`: Tracks how many places reference this file
- Files are only deleted when `references_total` reaches 0

#### `inline_image` table
- Links inline images to cards
- Fields: `id`, `card_id`, `uploaded_file_id`, `filename`, `markdown_path`
- `filename`: Physical filename (e.g., `card-123-image-2026-01-04T12-30-45-abc12345.png`)
- `markdown_path`: Path used in markdown (e.g., `uploads/card-123-image-...`)

### 3. File Naming Convention

Files are named deterministically for traceability:

```
card-{cardId}-image-{timestamp}-{randomSuffix}.{ext}
```

Example: `card-1234567890-image-2026-01-04T12-30-45-a1b2c3d4.png`

- `cardId`: ID of the card containing the image
- `timestamp`: ISO 8601 timestamp with colons replaced by hyphens
- `randomSuffix`: 8-character crypto-random hex string (prevents collisions)
- `ext`: File extension based on detected MIME type

### 4. File Lifecycle

#### Upload Flow
1. User pastes image in card description editor
2. Client uploads to `POST /api/cards/:cardId/inline-images`
3. Server validates MIME type and size
4. File saved to `public/uploads/` with unique filename
5. `UploadedFile` record created with `references_total = 1`
6. `InlineImage` record created linking to card and uploaded file
7. Markdown path returned to client (e.g., `/uploads/card-...png`)

#### Migration Flow (Legacy base64 → Files)
1. User edits card description containing base64 images
2. Server detects `data:image/...;base64,...` in markdown
3. Base64 decoded to buffer and validated
4. Each base64 image converted to physical file
5. Database records created (same as upload flow)
6. Markdown updated to replace base64 with file paths

#### Cleanup Flow
1. Orphaned images detected (not referenced in any card description)
2. `InlineImage` record deleted
3. `UploadedFile.references_total` decremented
4. If `references_total` reaches 0, file deleted from filesystem

### 5. Why `public/uploads/` for Inline Images?

Inline images are stored in a publicly accessible location because:

1. **Direct browser access**: Markdown renderers need direct access to image URLs
2. **Performance**: No authentication overhead for every image load
3. **Size limit**: 10MB max ensures no huge files in public storage
4. **Caching**: Public files can be cached by browsers and CDNs

Large attachments remain in `private/attachments/` with access control.

### 6. Security Considerations

- **MIME type validation**: Only image types allowed (png, jpg, jpeg, gif, webp, avif)
- **File size limits**: 10MB default prevents abuse
- **Content detection**: Uses `file-type` library to verify actual file content
- **Unique filenames**: Crypto-random suffixes prevent collisions and guessing
- **Reference counting**: Files automatically cleaned up when no longer referenced
- **No directory traversal**: Filenames are generated, not user-supplied

## Helper Functions

- `process-uploaded-file.js`: Handles new image uploads
- `migrate-legacy-images.js`: Converts base64 images to files on edit
- `cleanup-orphaned.js`: Removes unreferenced files (run periodically)
- `generate-inline-image-filename.js`: Creates unique filenames
- `validate-inline-image.js`: Validates MIME type and size

## Configuration

See `server/config/custom.js`:
- `inlineImagesPathSegment`: Directory path (`public/uploads`)
- `uploadsBasePath`: Base path for all uploads (app root)

## Maintenance

Run cleanup periodically to remove orphaned files:

```javascript
await sails.helpers.inlineImages.cleanupOrphaned({ dryRun: false });
```

Use `dryRun: true` to preview what would be deleted without actually deleting.
