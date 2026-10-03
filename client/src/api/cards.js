/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import omit from 'lodash/omit';

import socket from './socket';
import { transformAttachment } from './attachments';
import { transformActivity } from './activities';
import { transformNotification } from './notifications';

/* Transformers */

export const transformCard = (card) => ({
  ...card,
  ...(card.dueDate && {
    dueDate: new Date(card.dueDate),
  }),
  ...(card.stopwatch && {
    stopwatch: {
      ...card.stopwatch,
      ...(card.stopwatch.startedAt && {
        startedAt: new Date(card.stopwatch.startedAt),
      }),
    },
  }),
  ...(card.createdAt && {
    createdAt: new Date(card.createdAt),
  }),
  ...(card.listChangedAt && {
    listChangedAt: new Date(card.listChangedAt),
  }),
});

export const transformCardData = (data) => ({
  ...data,
  ...(data.dueDate && {
    dueDate: data.dueDate.toISOString(),
  }),
  ...(data.stopwatch && {
    stopwatch: {
      ...data.stopwatch,
      ...(data.stopwatch.startedAt && {
        startedAt: data.stopwatch.startedAt.toISOString(),
      }),
    },
  }),
});

/* Actions */

const getCards = (listId, data, headers) =>
  socket.get(`/lists/${listId}/cards`, data, headers).then((body) => ({
    ...body,
    items: body.items.map(transformCard),
    included: {
      ...body.included,
      attachments: body.included.attachments.map(transformAttachment),
    },
  }));

const createCard = (listId, data, headers) =>
  socket.post(`/lists/${listId}/cards`, transformCardData(data), headers).then((body) => ({
    ...body,
    item: transformCard(body.item),
  }));

const transformCardContent = (content) =>
  content.replace(
    /inline:\/\/([\w-]+)/g,
    (match, contentId) => `/api/inline-attachments/${contentId}`,
  );

const getCardContent = (id, headers) =>
  socket.get(`/cards/${id}/content`, undefined, headers).then((body) => ({
    ...body,
    content: transformCardContent(body.content),
  }));

const getCard = (id, headers) =>
  Promise.all([socket.get(`/cards/${id}`, undefined, headers), getCardContent(id, headers)]).then(
    ([body, cardContent]) => ({
      ...body,
      item: transformCard({
        ...body.item,
        description: cardContent.content,
      }),
      included: {
        ...body.included,
        attachments: body.included.attachments.map(transformAttachment),
      },
    }),
  );

const updateCardContent = (id, data, headers) => socket.put(`/cards/${id}/content`, data, headers);

const updateCard = async (id, data, headers) => {
  const transformedData = transformCardData(data);
  const hasDescription = Object.prototype.hasOwnProperty.call(transformedData, 'description');
  const cardData = hasDescription ? omit(transformedData, 'description') : transformedData;

  if (hasDescription) {
    await updateCardContent(
      id,
      {
        content: transformedData.description || '',
        contentType: 'markdown',
      },
      headers,
    );
  }

  const body =
    Object.keys(cardData).length > 0
      ? await socket.patch(`/cards/${id}`, cardData, headers)
      : await socket.get(`/cards/${id}`, undefined, headers);

  return {
    ...body,
    item: transformCard({
      ...body.item,
      ...(hasDescription && {
        description: transformedData.description || '',
      }),
    }),
  };
};

const duplicateCard = (id, data, headers) =>
  socket.post(`/cards/${id}/duplicate`, data, headers).then((body) => ({
    ...body,
    item: transformCard(body.item),
    included: {
      ...body.included,
      attachments: body.included.attachments.map(transformAttachment),
    },
  }));

const readCardNotifications = (id, headers) =>
  socket.post(`/cards/${id}/read-notifications`, undefined, headers).then((body) => ({
    ...body,
    item: transformCard(body.item),
    included: {
      ...body.included,
      notifications: body.included.notifications.map(transformNotification),
    },
  }));

const deleteCard = (id, headers) =>
  socket.delete(`/cards/${id}`, undefined, headers).then((body) => ({
    ...body,
    item: transformCard(body.item),
  }));

/* Event handlers */

const makeHandleCardsUpdate = (next) => (body) => {
  next({
    ...body,
    items: body.items.map(transformCard),
    included: body.included && {
      ...omit(body.included, 'actions'),
      activities: body.included.actions.map(transformActivity),
    },
  });
};

const makeHandleCardCreate = (next) => (body) => {
  next({
    ...body,
    item: transformCard(body.item),
  });
};

const makeHandleCardUpdate = makeHandleCardCreate;

const makeHandleCardDelete = makeHandleCardUpdate;

export default {
  getCards,
  createCard,
  getCard,
  getCardContent,
  updateCard,
  updateCardContent,
  duplicateCard,
  readCardNotifications,
  deleteCard,
  makeHandleCardsUpdate,
  makeHandleCardCreate,
  makeHandleCardUpdate,
  makeHandleCardDelete,
};
