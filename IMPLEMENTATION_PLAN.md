# Markdown Editor Image Paste Feature - Implementation Plan

## Overview
Implement GitLab-style image pasting where:
1. User pastes image → embedded as base64 (current behavior, unchanged)
2. User clicks Save → base64 images are extracted, uploaded to server, replaced with URLs
3. Final saved content contains server URLs, not base64
4. Editor renders URL-based images identically to base64 images (seamless UX)

**Benefits:**
- No orphan images (only saves images in final content)
- No TTL cleanup needed
- Seamless user experience
- Reduced database/content size (URLs vs base64)

---

## Architecture Summary

```
┌─────────────────┐    paste     ┌──────────────────┐
│  User pastes    │ ──────────▶  │  MarkdownEditor  │
│  image          │              │  (base64 embed)  │
└─────────────────┘              └──────────────────┘
                                          │
                                          │ click Save
                                          ▼
                                 ┌──────────────────┐
                                 │  Extract base64  │
                                 │  images from MD  │
                                 └────────┬─────────┘
                                          │ POST /api/cards/:cardId/pasted-images
                                          ▼
                                 ┌──────────────────┐
                                 │  Server saves    │
                                 │  to public/      │
                                 │  pasted-images/  │
                                 └────────┬─────────┘
                                          │ returns URL
                                          ▼
                                 ┌──────────────────┐
                                 │  Replace base64  │
                                 │  with URL in MD  │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Save card with  │
                                 │  converted desc  │
                                 └──────────────────┘
```

---

## Critical Finding: Image URL Sanitization

The markdown renderer (`/client/src/components/common/Markdown.jsx`) uses `@diplodoc/transform` with sanitization that **only allows these URL schemes for images**:
- `http://`
- `https://`
- `data:` (base64)

**Relative URLs like `/pasted-images/123/image.png` will be stripped!**

### Solution
Modify the sanitizer configuration to allow relative URLs for images by updating the `allowedSchemesByTag` or adding a custom URL validator that permits paths starting with `/pasted-images/`.

---

## Phase 1: Backend - Database & Models

### 1.1 Create Migration
**File:** `/server/db/migrations/YYYYMMDDHHMMSS_add_pasted_images.js`

```javascript
exports.up = async (knex) => {
  await knex.schema.createTable('pasted_image', (table) => {
    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));
    table.text('uploaded_file_id').notNullable();
    table.text('filename').notNullable();
    table.text('mime_type');
    table.bigInteger('size').notNullable();
    table.bigInteger('card_id').references('id').inTable('card').onDelete('CASCADE');
    table.bigInteger('creator_user_id').references('id').inTable('user_account').onDelete('SET NULL');
    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);
  });

  await knex.schema.table('pasted_image', (table) => {
    table.index('card_id');
  });

  await knex.schema.table('storage_usage', (table) => {
    table.bigInteger('pasted_images').notNullable().defaultTo(0);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTable('pasted_image');
  await knex.schema.table('storage_usage', (table) => {
    table.dropColumn('pasted_images');
  });
};
```

### 1.2 Create PastedImage Model
**File:** `/server/api/models/PastedImage.js`

### 1.3 Update UploadedFile Model
**File:** `/server/api/models/UploadedFile.js`
- Add `PASTED_IMAGE: 'pastedImage'` to Types enum

### 1.4 Add Query Methods
**File:** `/server/api/hooks/query-methods/models/PastedImage.js`
**File:** `/server/api/hooks/query-methods/models/UploadedFile.js`

**Verification:**
- [ ] Run migration successfully
- [ ] Verify `pasted_image` table exists with correct schema
- [ ] Verify `storage_usage.pasted_images` column added

---

## Phase 2: Backend - API Endpoint

### 2.1 Upload Endpoint
**File:** `/server/api/controllers/pasted-images/create.js`

**Route:** `POST /api/cards/:cardId/pasted-images`

**Logic:**
1. Get card, verify user has board editor permission
2. Receive file using `sails.helpers.utils.receiveFile()`
3. Validate MIME type is image/* (jpeg, png, gif, webp)
4. Process file using helper
5. Create PastedImage record linked to card
6. Return `{ item: { id, url } }`

### 2.2 Process Helper
**File:** `/server/api/helpers/pasted-images/process-uploaded-file.js`

### 2.3 Configuration
**File:** `/server/config/custom.js`
```javascript
pastedImagesPathSegment: 'public/pasted-images',
```

### 2.4 Routes
**File:** `/server/config/routes.js`
```javascript
'POST /api/cards/:cardId/pasted-images': 'pasted-images/create',

'GET /pasted-images/*': {
  fn: staticDirServer('/pasted-images', () =>
    path.join(
      path.resolve(sails.config.custom.uploadsBasePath),
      sails.config.custom.pastedImagesPathSegment,
    ),
  ),
  skipAssets: false,
},
```

### 2.5 Policies
**File:** `/server/config/policies.js`

**Verification:**
- [ ] Upload endpoint accepts image file via curl/Postman
- [ ] File saved to `public/pasted-images/{id}/`
- [ ] UploadedFile and PastedImage records created
- [ ] Static serving works: `GET /pasted-images/{id}/filename`

---

## Phase 3: Frontend - API Client

### 3.1 Create API Module
**File:** `/client/src/api/pasted-images.js`

```javascript
import http from './http';

export const createPastedImageWithFile = (cardId, file) => {
  const data = new FormData();
  data.append('file', file);

  return http.post(`/cards/${cardId}/pasted-images`, data, {
    headers: {},
  });
};

export default {
  createPastedImageWithFile,
};
```

### 3.2 Export from Index
**File:** `/client/src/api/index.js`

**Verification:**
- [ ] API client can upload file from browser console
- [ ] Response contains correct URL

---

## Phase 4: Frontend - Markdown Renderer Update

### 4.1 Update Sanitization Config
**File:** `/client/src/components/common/Markdown.jsx`

The current config only allows `http`, `https`, `data` schemes:
```javascript
sanitizeOptions: {
  ...defaultSanitizeOptions,
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
},
```

**Solution:** Add custom URL validation to allow relative `/pasted-images/` URLs:

```javascript
const isAllowedImageUrl = (url) => {
  if (!url) return false;
  // Allow relative pasted-images URLs
  if (url.startsWith('/pasted-images/')) return true;
  // Allow standard schemes
  return /^(https?|data):/.test(url);
};

// Update sanitize options to use custom filter
sanitizeOptions: {
  ...defaultSanitizeOptions,
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  transformTags: {
    img: (tagName, attribs) => {
      if (attribs.src && !isAllowedImageUrl(attribs.src)) {
        return { tagName: '', attribs: {} }; // Strip invalid images
      }
      return { tagName, attribs };
    },
  },
},
```

**Verification:**
- [ ] Markdown with `/pasted-images/123/image.png` URL renders image
- [ ] Invalid URLs are still stripped
- [ ] Base64 images still work

---

## Phase 5: Frontend - Base64 Extraction & Conversion

### 5.1 Create Utility Function
**File:** `/client/src/utils/process-markdown-images.js`

```javascript
import api from '../api';

/**
 * Extracts base64 images from markdown, uploads them, replaces with URLs
 */
export const processMarkdownImages = async (markdown, cardId) => {
  // Match: ![alt](data:image/type;base64,data)
  const base64ImageRegex = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([^)]+))\)/g;

  const matches = [...markdown.matchAll(base64ImageRegex)];
  if (matches.length === 0) return markdown;

  let result = markdown;

  for (const match of matches) {
    const [fullMatch, alt, dataUrl, mimeSubtype, base64Data] = match;

    // Convert base64 to File
    const byteCharacters = atob(base64Data);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: `image/${mimeSubtype}` });
    const file = new File([blob], `image.${mimeSubtype}`, { type: `image/${mimeSubtype}` });

    // Upload to server
    const response = await api.pastedImages.createPastedImageWithFile(cardId, file);
    const url = response.item.url;

    // Replace base64 with URL
    result = result.replace(fullMatch, `![${alt}](${url})`);
  }

  return result;
};
```

**Verification:**
- [ ] Regex correctly extracts base64 images
- [ ] Base64 converted to File correctly
- [ ] Multiple images processed correctly

---

## Phase 6: Frontend - Remove Size Limit & Add Size Indicator

### 6.1 Current Behavior (to be changed)
**File:** `/client/src/components/common/EditMarkdown/EditMarkdown.jsx`

Current implementation:
- `MAX_LENGTH = 1048576` (1MB) blocks saving
- `isExceeded` flag disables Save button
- Shows error: "Content exceeds limit (1MB)"

### 6.2 New Behavior
- **Remove save restriction** - Allow saving regardless of content size
- **Add size indicator** - Show subtle gray text displaying content size
- **Process on save** - Extract base64 images before saving, so final content is small

### 6.3 Modify EditMarkdown
**File:** `/client/src/components/common/EditMarkdown/EditMarkdown.jsx`

```javascript
import { formatBytes } from '../../../utils/format-bytes';

const EditMarkdown = React.memo(({ cardId, defaultValue, draftValue, onUpdate, onClose }) => {
  const [value, setValue] = useState(() => draftValue || defaultValue || '');
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate content size for display
  const contentSize = new Blob([value]).size;

  const submit = useCallback(async () => {
    const cleanValue = value.trim() || null;

    if (cleanValue !== defaultValue) {
      let processedValue = cleanValue;

      // Convert base64 images to URLs if cardId is provided
      if (cardId && processedValue) {
        setIsProcessing(true);
        try {
          processedValue = await processMarkdownImages(processedValue, cardId);
        } catch (error) {
          console.error('Failed to process images:', error);
          // Continue with original value on error
        }
        setIsProcessing(false);
      }

      onUpdate(processedValue);
    }

    onClose(null);
  }, [cardId, onUpdate, onClose, defaultValue, value]);

  return (
    <>
      <MarkdownEditor ... />
      <Form onSubmit={handleSubmit}>
        <div className={styles.controls}>
          {/* Size indicator */}
          <span className={styles.sizeIndicator}>
            {formatBytes(contentSize)}
          </span>
          <Button
            positive
            content={isProcessing ? t('common.processing') : t('action.save')}
            disabled={isProcessing}
          />
          <Button type="button" content={t('action.cancel')} onClick={handleCancelClick} />
        </div>
      </Form>
    </>
  );
});
```

### 6.4 Add Size Indicator Styles
**File:** `/client/src/components/common/EditMarkdown/EditMarkdown.module.scss`

```scss
.sizeIndicator {
  color: #888;
  font-size: 12px;
  margin-right: auto;
  align-self: center;
}
```

### 6.5 Create Format Bytes Utility
**File:** `/client/src/utils/format-bytes.js`

```javascript
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};
```

### 6.6 Pass cardId to EditMarkdown
**File:** `/client/src/components/cards/CardModal/StoryContent.jsx`
**File:** `/client/src/components/cards/CardModal/ProjectContent.jsx`

**Verification:**
- [ ] Size indicator shows content size (e.g., "1.2 KB", "3.5 MB")
- [ ] Paste image in editor (size increases, shows in indicator)
- [ ] Save button NOT disabled even with large content
- [ ] Click Save - shows "Processing..." during image upload
- [ ] After save, content size is smaller (URLs instead of base64)
- [ ] Image displays correctly after save/reload

---

## Phase 7: Cleanup on Card Delete

### 7.1 Modify Card Delete Helper
**File:** `/server/api/helpers/cards/delete-one.js`

Add cleanup before card deletion:

```javascript
// Delete pasted images associated with this card
const pastedImages = await PastedImage.find({ cardId: inputs.record.id });
const fileManager = sails.hooks['file-manager'].getInstance();

for (const image of pastedImages) {
  try {
    await fileManager.deleteDir(
      `${sails.config.custom.pastedImagesPathSegment}/${image.uploadedFileId}`
    );
    await UploadedFile.qm.deleteOne(image.uploadedFileId);
  } catch (error) {
    sails.log.warn(`Failed to delete pasted image: ${image.uploadedFileId}`, error);
  }
}

await PastedImage.destroy({ cardId: inputs.record.id });
```

**Verification:**
- [ ] Create card with pasted image
- [ ] Delete card
- [ ] Image files deleted from disk
- [ ] Database records deleted

---

## File Summary

### Files to Create (9 files)
| File | Purpose |
|------|---------|
| `/server/db/migrations/YYYYMMDDHHMMSS_add_pasted_images.js` | Database migration |
| `/server/api/models/PastedImage.js` | PastedImage model |
| `/server/api/controllers/pasted-images/create.js` | Upload endpoint |
| `/server/api/helpers/pasted-images/process-uploaded-file.js` | Image processing |
| `/server/api/hooks/query-methods/models/PastedImage.js` | Query methods |
| `/client/src/api/pasted-images.js` | Client API |
| `/client/src/utils/process-markdown-images.js` | Base64 extraction utility |
| `/client/src/utils/format-bytes.js` | Format bytes for size indicator |
| `/server/public/pasted-images/.gitkeep` | Storage directory |

### Files to Modify (11 files)
| File | Changes |
|------|---------|
| `/server/api/models/UploadedFile.js` | Add PASTED_IMAGE type |
| `/server/api/hooks/query-methods/models/UploadedFile.js` | Add column mapping |
| `/server/config/custom.js` | Add pastedImagesPathSegment |
| `/server/config/routes.js` | Add routes |
| `/server/config/policies.js` | Add policy for upload |
| `/client/src/api/index.js` | Export pasted-images API |
| `/client/src/components/common/Markdown.jsx` | Allow /pasted-images/ URLs in sanitizer |
| `/client/src/components/common/EditMarkdown/EditMarkdown.jsx` | Remove size limit, add indicator, process images |
| `/client/src/components/common/EditMarkdown/EditMarkdown.module.scss` | Add size indicator styles |
| `/client/src/components/cards/CardModal/StoryContent.jsx` | Pass cardId |
| `/client/src/components/cards/CardModal/ProjectContent.jsx` | Pass cardId |
| `/server/api/helpers/cards/delete-one.js` | Cleanup on delete |

---

## Testing Checklist

### Phase 1 Verification
- [ ] Migration runs successfully
- [ ] `pasted_image` table created with correct schema
- [ ] `storage_usage.pasted_images` column added

### Phase 2 Verification
- [ ] Upload endpoint accepts image file
- [ ] File saved to `public/pasted-images/{id}/`
- [ ] UploadedFile record created
- [ ] PastedImage record created
- [ ] Static file serving works (`GET /pasted-images/{id}/filename`)

### Phase 3 Verification
- [ ] API client can upload file
- [ ] Response contains correct URL

### Phase 4 Verification
- [ ] Markdown with `/pasted-images/...` URL renders image correctly
- [ ] Invalid URLs are still stripped
- [ ] Base64 images still work
- [ ] External http/https images still work

### Phase 5 Verification
- [ ] Regex correctly extracts base64 images
- [ ] Base64 converted to File correctly
- [ ] Multiple images processed correctly

### Phase 6 Verification
- [ ] Size indicator shows content size (e.g., "1.2 KB", "3.5 MB")
- [ ] Pasting image increases size shown in indicator
- [ ] Save button is NOT disabled with large content (no 1MB limit)
- [ ] Click Save shows "Processing..." during image conversion
- [ ] After save, content size is reduced (URLs replace base64)
- [ ] Image displays correctly after save/reload
- [ ] Can paste, delete, duplicate images freely

### Phase 7 Verification
- [ ] Card delete removes image files
- [ ] Card delete removes database records

---

## Security Considerations
1. **MIME validation**: Only accept image/* types
2. **Size limits**: Use existing maxUploadFileSize
3. **Authorization**: Upload requires board editor permission
4. **URL sanitization**: Only allow `/pasted-images/` prefix for relative URLs
5. **Path safety**: Sanitize filenames to prevent directory traversal
