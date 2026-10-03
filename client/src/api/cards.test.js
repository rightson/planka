import socket from './socket';
import cardsApi from './cards';

jest.mock('./socket', () => ({
  get: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
}));
jest.mock('./attachments', () => ({
  transformAttachment: (attachment) => attachment,
}));
jest.mock('./activities', () => ({
  transformActivity: (activity) => activity,
}));
jest.mock('./notifications', () => ({
  transformNotification: (notification) => notification,
}));

const cardBody = {
  item: {
    id: '1',
    description: 'legacy',
  },
  included: {
    attachments: [],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('loads card content from the content endpoint and makes inline attachments renderable', async () => {
  socket.get.mockImplementation((path) => {
    if (path === '/cards/1/content') {
      return Promise.resolve({ content: '![image](inline://image-1)' });
    }

    return Promise.resolve(cardBody);
  });

  const { item } = await cardsApi.getCard('1');

  expect(item.description).toBe('![image](/api/inline-attachments/image-1)');
});

test('saves descriptions through the content endpoint without patching the legacy field', async () => {
  socket.put.mockResolvedValue({});
  socket.get.mockResolvedValue(cardBody);

  const { item } = await cardsApi.updateCard('1', { description: 'new content' });

  expect(socket.put).toHaveBeenCalledWith(
    '/cards/1/content',
    { content: 'new content', contentType: 'markdown' },
    undefined,
  );
  expect(socket.patch).not.toHaveBeenCalled();
  expect(item.description).toBe('new content');
});

test('keeps regular card fields on the existing update endpoint', async () => {
  socket.patch.mockResolvedValue(cardBody);

  await cardsApi.updateCard('1', { name: 'Renamed' });

  expect(socket.put).not.toHaveBeenCalled();
  expect(socket.patch).toHaveBeenCalledWith('/cards/1', { name: 'Renamed' }, undefined);
});
