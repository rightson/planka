/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const fsPromises = require('fs').promises;
const crypto = require('crypto');
const { rimraf } = require('rimraf');
const { fileTypeFromFile } = require('file-type');
const { getEncoding } = require('istextorbinary');
const sharp = require('sharp');

const filenamify = require('../../../utils/filenamify');
const { MAX_SIZE_TO_GET_ENCODING, MAX_SIZE_TO_PROCESS_AS_IMAGE } = require('../../../constants');

module.exports = {
  inputs: {
    file: {
      type: 'json',
      required: true,
    },
    cardId: {
      type: 'string',
      required: true,
    },
    source: {
      type: 'string',
      defaultsTo: 'paste',
    },
    altText: {
      type: 'string',
    },
  },

  async fn(inputs) {
    const fileManager = sails.hooks['file-manager'].getInstance();

    const filename = filenamify(inputs.file.filename);
    const fileType = await fileTypeFromFile(inputs.file.fd);
    const { mime: mimeType = null } = fileType || {};
    const { size } = inputs.file;

    let buffer;
    let encoding = null;

    // Read buffer for deduplication and encoding detection
    if (size <= MAX_SIZE_TO_GET_ENCODING) {
      try {
        buffer = await fsPromises.readFile(inputs.file.fd);
      } catch (error) {
        /* empty */
      }

      if (buffer) {
        encoding = getEncoding(buffer);
      }
    } else {
      // For larger files, read the whole thing for hashing
      try {
        buffer = await fsPromises.readFile(inputs.file.fd);
      } catch (error) {
        /* empty */
      }
    }

    // Calculate hash for deduplication
    const hash = buffer ? crypto.createHash('sha256').update(buffer).digest('hex') : null;

    // Check if file already exists (deduplication)
    let uploadedFile = null;
    if (hash) {
      // We'll need to add a hash column to uploaded_file table
      // For now, create new uploaded file every time
      // TODO: Implement deduplication by checking hash
    }

    // Create new uploaded file if not found
    if (!uploadedFile) {
      uploadedFile = await UploadedFile.qm.createOne({
        mimeType,
        size,
        type: UploadedFile.Types.ATTACHMENT,
      });
    }

    const dirPathSegment = `private/inline-attachments/${uploadedFile.id}`;

    const filePath = await fileManager.move(
      inputs.file.fd,
      `${dirPathSegment}/${filename}`,
      inputs.file.type,
    );

    const data = {
      uploadedFileId: uploadedFile.id,
      filename,
      mimeType,
      size,
      encoding,
      image: null,
    };

    // Process image thumbnails
    if (mimeType && mimeType.startsWith('image/') && size <= MAX_SIZE_TO_PROCESS_AS_IMAGE) {
      let image = sharp(buffer || filePath || inputs.file.fd, {
        animated: true,
      });

      let metadata;
      try {
        metadata = await image.metadata();
      } catch (error) {
        /* empty */
      }

      if (metadata) {
        let { width, pageHeight: height = metadata.height } = metadata;
        if (metadata.orientation && metadata.orientation > 4) {
          [image, width, height] = [image.rotate(), height, width];
        }

        const thumbnailsPathSegment = `${dirPathSegment}/thumbnails`;
        const thumbnailsExtension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;

        const cover360 = image
          .clone()
          .resize(360, 360, {
            fit: 'cover',
            withoutEnlargement: true,
          })
          .png({
            quality: 75,
            force: false,
          });

        const outside720 = image
          .clone()
          .resize(720, 720, {
            fit: 'outside',
            withoutEnlargement: true,
          })
          .png({
            quality: 75,
            force: false,
          });

        try {
          await Promise.all([
            fileManager.save(
              `${thumbnailsPathSegment}/cover-360.${thumbnailsExtension}`,
              cover360,
              inputs.file.type,
            ),
            fileManager.save(
              `${thumbnailsPathSegment}/outside-720.${thumbnailsExtension}`,
              outside720,
              inputs.file.type,
            ),
          ]);

          data.image = {
            width,
            height,
            thumbnailsExtension,
          };
        } catch (error) {
          sails.log.warn(error.stack);
          await fileManager.deleteDir(thumbnailsPathSegment);
        }
      }
    }

    if (!filePath) {
      await rimraf(inputs.file.fd);
    }

    // Generate unique content ID for markdown reference
    const contentId = `img_${crypto.randomBytes(8).toString('hex')}`;

    // Create InlineAttachment record
    const inlineAttachment = await InlineAttachment.create({
      cardId: inputs.cardId,
      uploadedFileId: uploadedFile.id,
      attachmentType: InlineAttachment.AttachmentTypes.INLINE,
      source: inputs.source,
      contentId,
      altText: inputs.altText || filename,
      isActive: true,
      referenceCount: 1,
    }).fetch();

    return {
      inlineAttachment,
      data,
    };
  },
};
