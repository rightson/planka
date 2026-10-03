const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const helper = require('../../api/helpers/inline-images/process-uploaded-file');
const cleanup = require('../../api/helpers/inline-images/cleanup-orphaned');
const model = require('../../api/models/InlineImage');

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
    console.log('PASS: valid ORM paths, non-null URL, temp cleanup, failure rollback, safe orphan reporting');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
