const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createNetlifyBlobsPdfStore } = require('../server/storage/netlify-blobs.cjs');
const { createLocalPdfStore } = require('../server/storage/local.cjs');

test('writes PDF bytes and content type metadata to the protocol Blobs store', async () => {
  let requestedStoreName;
  let setArguments;
  const pdfStore = createNetlifyBlobsPdfStore({
    getStore(storeName) {
      requestedStoreName = storeName;
      return {
        async set(...arguments_) {
          setArguments = arguments_;
        }
      };
    },
    storeName: 'protocol-pdfs'
  });

  await pdfStore.put('users/u/protocols/p.pdf', Buffer.from('%PDF'), {
    contentType: 'application/pdf'
  });

  assert.equal(requestedStoreName, 'protocol-pdfs');
  assert.equal(setArguments[0], 'users/u/protocols/p.pdf');
  assert.deepEqual(Buffer.from(setArguments[1]), Buffer.from('%PDF'));
  assert.deepEqual(setArguments[2], {
    metadata: { contentType: 'application/pdf' }
  });
});

test('reads PDF bytes and returns null when the Blobs store has no key', async () => {
  const pdfBytes = Buffer.from('%PDF-1.7');
  const pdfStore = createNetlifyBlobsPdfStore({
    getStore() {
      return {
        async get(key, options) {
          assert.equal(options.type, 'arrayBuffer');
          return key === 'users/u/protocols/p.pdf'
            ? pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
            : null;
        }
      };
    },
    storeName: 'protocol-pdfs'
  });

  const found = await pdfStore.get('users/u/protocols/p.pdf');
  const missing = await pdfStore.get('users/u/protocols/missing.pdf');

  assert.deepEqual(found, pdfBytes);
  assert.equal(missing, null);
});

test('deletes a PDF key from the Blobs store', async () => {
  const storedKeys = new Set(['users/u/protocols/p.pdf']);
  const pdfStore = createNetlifyBlobsPdfStore({
    getStore() {
      return {
        async delete(key) {
          storedKeys.delete(key);
        }
      };
    },
    storeName: 'protocol-pdfs'
  });

  await pdfStore.delete('users/u/protocols/p.pdf', { ignoreMissing: true });

  assert.equal(storedKeys.has('users/u/protocols/p.pdf'), false);
});

test('writes and reads PDF bytes below the local storage root', async (t) => {
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'protocol-pdf-store-'));
  t.after(() => fs.rm(rootDirectory, { recursive: true, force: true }));
  const pdfStore = createLocalPdfStore({ rootDirectory });
  const key = 'users/u/protocols/p.pdf';
  const pdfBytes = Buffer.from('%PDF-1.7');

  await pdfStore.put(key, pdfBytes, { contentType: 'application/pdf' });

  assert.deepEqual(await pdfStore.get(key), pdfBytes);
  assert.deepEqual(
    await fs.readFile(path.join(rootDirectory, 'users', 'u', 'protocols', 'p.pdf')),
    pdfBytes
  );
});

test('deletes local PDFs and rejects keys outside the storage root', async (t) => {
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'protocol-pdf-store-'));
  t.after(() => fs.rm(rootDirectory, { recursive: true, force: true }));
  const pdfStore = createLocalPdfStore({ rootDirectory });
  const key = 'users/u/protocols/p.pdf';

  await pdfStore.put(key, Buffer.from('%PDF'));
  await pdfStore.delete(key);
  assert.equal(await pdfStore.get(key), null);
  await pdfStore.delete(key, { ignoreMissing: true });
  await assert.rejects(
    () => pdfStore.put('../outside.pdf', Buffer.from('%PDF')),
    /must resolve below the local storage root/
  );
  await assert.rejects(
    () => pdfStore.put('..', Buffer.from('%PDF')),
    /must resolve below the local storage root/
  );
});
