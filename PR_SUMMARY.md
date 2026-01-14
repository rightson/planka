# PR: Inline Image Uploads for Card Descriptions

## Summary

Replace base64 data URLs for pasted images with file-backed uploads. Inline images are stored under `public/uploads/`, tracked in the database, and rendered via `/uploads/...` URLs. Legacy base64 content is migrated on edit with a fallback to keep content intact if migration fails.

## Changes

- Server: add `/api/cards/:cardId/inline-images` upload endpoint with MIME/size validation and `UploadedFile` + `InlineImage` records.
- Server: create `inline_image` table and model, add `/uploads/*` static route, and store inline images under `public/uploads/`.
- Server: migrate base64 images on card description updates; increase description limit to 20MB to allow pre-migration content.
- Server: add orphan cleanup helper and a daily cleanup hook (next midnight, then every 24h).
- Client: wire the markdown editor to upload pasted images when a `cardId` is available; fallback to base64 on failure.
- Client: raise the editor size limit to 20MB and pass `cardId` into markdown editors.
- Build: suppress noisy Rollup/CSS warnings in `client/vite.config.js`.

## Data/Storage

- New `inline_image` table with indexes on `card_id`, `uploaded_file_id`, and `markdown_path`.
- Inline images stored as `UploadedFile` rows with `references_total = 1` and an `InlineImage` link record.
- Filenames use `card-{cardId}-image-{timestamp}-{randomSuffix}.{ext}` for uniqueness.

## Configuration

- `sails.config.custom.inlineImagesPathSegment`: defaults to `public/uploads`.
- Cleanup hook can be disabled with `CLEANUP_INLINE_IMAGES_ENABLED=false`.

## Backward Compatibility

- Existing base64 images continue to render.
- Base64 images are migrated to files on edit when possible.
- Upload failures fall back to base64 to avoid blocking saves.

## Testing

- Not run (manual verification recommended: paste image, edit legacy base64 card, verify `/uploads/...` files and `inline_image` rows).
