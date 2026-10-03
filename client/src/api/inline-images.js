/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import http from './http';

/* Actions */

const uploadInlineImage = (cardId, file, headers) =>
  http.post(`/cards/${cardId}/inline-images`, { file }, headers).then((body) => ({
    ...body,
    markdownPath: body.markdownPath,
    url: body.url,
    filename: body.filename,
    mimeType: body.mimeType,
    size: body.size,
  }));

export default {
  uploadInlineImage,
};
