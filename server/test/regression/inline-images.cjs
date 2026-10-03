const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const helper = require('../../api/helpers/inline-images/process-uploaded-file');
const cleanup = require('../../api/helpers/inline-images/cleanup-orphaned');
const model = require('../../api/models/InlineImage');
const download = require('../../api/controllers/inline-images/download');
const { Readable } = require('node:stream');

function validation() {
  const promise = Promise.resolve({ extension: 'png' });
  promise.intercept = () => promise;
  return promise;
}

(async () => {
  assert.equal(model.tableName, 'inline_image');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'inline-images-'));
  const events = [];
  let failRecord = false;
  global.sails = {
    config: { custom: { inlineImagesPathSegment: 'private/inline-images' } },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    sendNativeQuery: async () => ({ rows: [{ exists: true }] }),
    hooks: { 'file-manager': { getInstance: () => ({
      save: async (name, stream) => {
        const parts = [];
        for await (const chunk of stream) parts.push(chunk);
        assert.ok(Buffer.concat(parts).length > 0);
        events.push(`save:${name}`);
      },
      delete: async (name) => events.push(`delete:${name}`),
    }) } },
    helpers: { utils: {
      validateInlineImage: validation,
      generateInlineImageFilename: async () => 'image.png',
    } },
  };
  global.UploadedFile = {
    Types: { ATTACHMENT: 'attachment' },
    qm: {
      createOne: async (values) => {
        assert.equal(values.referencesTotal, 1);
        return { id: '456' };
      },
      deleteOne: async (criteria) => events.push(`rollback:${criteria}`),
    },
  };
  global.InlineImage = {
    create: (values) => ({ fetch: async () => {
      assert.ok(values.markdownPath, 'the database column is NOT NULL');
      if (failRecord) throw new Error('record failure');
      return { id: '123' };
    } }),
    updateOne: async (id, values) => {
      assert.equal(id, '123');
      assert.equal(values.markdownPath, 'api/inline-images/123');
    },
  };
  const createFile = async () => {
    const fd = path.join(directory, 'upload.png');
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=', 'base64');
    await fs.writeFile(fd, bytes);
    return { fd, size: bytes.length };
  };
  const exits = { success: (value) => value, invalidMimeType() { throw new Error('mime'); } };
  try {
    let file = await createFile();
    const result = await helper.fn({ cardId: '1', file, maxSize: 1024 }, exits);
    assert.equal(result.url, '/api/inline-images/123');
    await assert.rejects(fs.access(file.fd));
    failRecord = true;
    file = await createFile();
    await assert.rejects(helper.fn({ cardId: '1', file, maxSize: 1024 }, exits), /record failure/);
    assert.ok(events.includes('delete:private/inline-images/image.png'));
    assert.ok(events.includes('rollback:456'));
    await assert.rejects(fs.access(file.fd));
    await assert.rejects(cleanup.fn({ dryRun: false }, exits), /race-safe/);
    InlineImage.find = async () => [{ id: 'new', filename: 'new.png', markdownPath: 'api/inline-images/new' }];
    global.Card = { find: async () => [] };
    const before = events.length;
    const report = await cleanup.fn({ dryRun: true }, exits);
    assert.equal(report.orphaned, 1);
    assert.equal(report.deleted, 0);
    assert.equal(events.length, before);
    assert.equal(require('../../config/routes').routes['GET /api/inline-images/:id'],
      'inline-images/download');
    assert.ok(require('../../config/policies').policies['*'].includes('is-authenticated'));
    InlineImage.findOne = async () => ({ id: '123', cardId: '1', uploadedFileId: '456', filename: 'image.png' });
    UploadedFile.findOne = async () => ({ mimeType: 'image/png', size: '1' });
    sails.helpers.cards = { getPathToProjectById: () => {
      const promise = Promise.resolve({ board: { id: 'board' } });
      promise.intercept = () => promise;
      return promise;
    } };
    let member = true;
    let reads = 0;
    global.BoardMembership = { qm: { getOneByBoardIdAndUserId: async () => member ? {} : null } };
    sails.hooks['file-manager'].getInstance = () => ({ read: async (name) => {
      reads += 1;
      assert.equal(name, 'private/inline-images/image.png');
      return Readable.from(Buffer.from('x'));
    } });
    const headers = {};
    const context = { req: { currentUser: { id: '7' } }, res: { set: (key, value) => { headers[key] = value; } } };
    const stream = await download.fn.call(context, { id: '123' }, exits);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'x');
    assert.match(headers['Cache-Control'], /^private/);
    member = false;
    await assert.rejects(download.fn.call(context, { id: '123' }, exits),
      (error) => Boolean(error.notEnoughRights));
    assert.equal(reads, 1, 'non-members cannot read stored files');
    console.log('PASS: valid ORM paths, non-null URL, temp cleanup, failure rollback, safe orphan reporting');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
