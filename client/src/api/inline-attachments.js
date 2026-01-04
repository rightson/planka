/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import http from './http';

/* Actions */

const createInlineAttachment = (cardId, { file, source = 'paste', altText }, headers) =>
  http
    .post(
      `/cards/${cardId}/inline-attachments`,
      {
        file,
        source,
        ...(altText && { altText }),
      },
      headers,
    )
    .then((body) => ({
      ...body,
      item: {
        ...body.item,
        ...(body.item.createdAt && {
          createdAt: new Date(body.item.createdAt),
        }),
      },
    }));

const getInlineAttachments = (cardId, headers) =>
  http.get(`/cards/${cardId}/inline-attachments`, undefined, headers).then((body) => ({
    ...body,
    items: body.items.map((item) => ({
      ...item,
      ...(item.createdAt && {
        createdAt: new Date(item.createdAt),
      }),
      ...(item.updatedAt && {
        updatedAt: new Date(item.updatedAt),
      }),
    })),
  }));

export default {
  createInlineAttachment,
  getInlineAttachments,
};
