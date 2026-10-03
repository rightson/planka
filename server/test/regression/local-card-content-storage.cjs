const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LocalFileManager = require('../../api/hooks/file-manager/LocalFileManager');

(async () => {
  const uploadsBasePath = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'planka-card-content-'),
  );

  global.sails = {
    config: {
      custom: {
        uploadsBasePath,
        baseUrl: 'http://localhost',
      },
    },
  };

  const manager = new LocalFileManager();

  try {
    const firstRef = await manager.saveCardContent('42', '第一版', 1, 'hash-one');
    const secondRef = await manager.saveCardContent('42', 'second version', 2, 'hash-two');

    assert.equal(firstRef, 'private/card-content/42/v1-hash-one.md');
    assert.equal(secondRef, 'private/card-content/42/v2-hash-two.md');
    assert.equal(await manager.readCardContent(firstRef), '第一版');
    assert.equal(await manager.readCardContent(secondRef), 'second version');

    const attachment = Buffer.from('image bytes');
    const attachmentRef = await manager.saveInlineAttachment('99', 'pasted image.png', attachment);

    assert.equal(attachmentRef, 'private/inline-attachments/99/pasted image.png');
    assert.deepEqual(await manager.readInlineAttachment(attachmentRef), attachment);

    await manager.delete(secondRef);
    await assert.rejects(manager.readCardContent(secondRef), /File does not exist/);
    assert.equal(await manager.readCardContent(firstRef), '第一版');

    console.log('PASS: local content versions and inline attachments round-trip independently');
  } finally {
    await fs.promises.rm(uploadsBasePath, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
