const assert = require('node:assert/strict');
const migrate = require('../../api/helpers/card-content/auto-migrate-from-description');
const save = require('../../api/helpers/card-content/create-or-update-one');

const chain = (value) => ({
  set() { return this; }, usingConnection() { return this; },
  fetch: async () => value,
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

(async () => {
  const first = '![one](data:image/png;base64,YQ==)';
  const second = '![two](data:image/png;base64,Yg==)';
  let created = 0;
  global.Card = { findOne: async () => ({ description: `${first}\n${second}` }) };
  global.UploadedFile = {
    Types: { ATTACHMENT: 'attachment' },
    qm: { createOne: async (values) => {
      assert.equal(values.type, 'attachment');
      return { id: String(++created) };
    } },
  };
  global.InlineAttachment = {
    Sources: { MIGRATION: 'migration' },
    create: () => chain({ id: '123' }),
  };
  global.sails = {
    log: { info() {}, warn() {}, debug() {}, error() {} },
    hooks: { 'file-manager': { getInstance: () => ({
      saveInlineAttachment: async (id) => { if (id === '2') throw new Error('disk full'); },
    }) } },
  };
  const migrated = await migrate.fn({ cardId: '1' });
  assert.match(migrated.content, /!\[one\]\(inline:\/\/[a-f0-9]+\)/);
  assert.ok(migrated.content.includes(second), 'failed image retains its original data URL');
  assert.ok(!migrated.content.includes('__INLINE_ATTACHMENT_'));
  assert.equal(migrated.inlineAttachmentCount, 1);

  let values;
  const activity = [];
  global.Card = {
    findOne: async () => ({ description: 'old', contentMigrated: false }),
    updateOne: () => chain(null),
  };
  global.CardContent = {
    StorageTypes: { INLINE: 'inline', EXTERNAL: 'external' },
    findOne: () => ({ sort: () => chain(null) }),
    create: (input) => { values = input; return chain(input); },
  };
  global.InlineAttachment.find = async () => [{ id: '987', contentId: 'img' }];
  global.InlineAttachment.update = (criteria) => ({
    set: (state) => {
      activity.push({ criteria, state });
      return chain(null);
    },
  });
  sails.helpers = { cardContent: { autoMigrateFromDescription: async () => {
    throw new Error('new edits must not migrate the old description');
  } } };
  sails.config = { custom: { cardContentInlineThreshold: 1000 } };
  sails.getDatastore = () => ({ transaction: async (fn) => fn({}) });
  sails.sendNativeQuery = () => chain({ rows: [{ id: '1' }] });
  sails.hooks = { 'file-manager': { getInstance: () => ({ delete: async () => {} }) } };
  await save.fn({ cardId: '1', content: '![x](inline://img)', contentType: 'markdown' });
  assert.deepEqual(values.inlineAttachmentIds, ['987'], 'store database IDs, not content IDs');
  assert.equal(activity.at(-1).state.isActive, true);
  activity.length = 0;
  await save.fn({ cardId: '1', content: 'no images', contentType: 'markdown' });
  assert.equal(activity.length, 1);
  assert.equal(activity[0].state.isActive, false, 'removing the last image clears activity');
  global.InlineAttachment.find = async () => [];
  await assert.rejects(save.fn({ cardId: '1', content: 'inline://foreign' }), /cross-card/);

  let savedExternal;
  global.InlineAttachment.find = async () => [];
  sails.config.custom.cardContentInlineThreshold = 1;
  sails.hooks = { 'file-manager': { getInstance: () => ({
    saveCardContent: async (...args) => {
      savedExternal = args;
      return `private/card-content/${args[0]}/v${args[2]}-${args[3]}.md`;
    },
    delete: async () => {},
  }) } };
  await save.fn({ cardId: '1', content: 'external content', contentType: 'markdown' });
  assert.equal(savedExternal[2], 1);
  assert.match(savedExternal[3], /^[a-f0-9]{64}$/);
  assert.equal(values.contentRef, `private/card-content/1/v1-${savedExternal[3]}.md`);

  console.log(
    'PASS: migration preservation, scoped IDs, activity reset, cross-card rejection, locked external version',
  );
})().catch((error) => { console.error(error); process.exitCode = 1; });
