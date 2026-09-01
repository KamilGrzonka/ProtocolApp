const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProtocolService } = require('../server/protocol-service.cjs');
const { initializeFirebaseAdmin } = require('../server/firebase-admin.cjs');

const validBody = Object.freeze({
  typProtokolu: 'wydanie',
  ImieNazwisko: 'Jan Kowalski',
  PESEL: '90010112345',
  Data: '2026-08-03',
  ModelKomputera: 'ThinkPad T14',
  NumerSerwisowy: 'SER-123',
  Ladowarka: 'Tak',
  Monitor: 'Nie',
  Klawiatura: 'Nie',
  Mysz: 'Nie',
  Sluchawki: 'Nie',
  Wartosc: '1000 PLN',
  Uwagi: 'Brak'
});

test('returns a Firebase token verifier without configuring Firebase Storage', () => {
  const { admin, firestore, verifyIdToken } = initializeFirebaseAdmin({});

  assert.equal(typeof admin.initializeApp, 'function');
  assert.equal(firestore, null);
  assert.equal(typeof verifyIdToken, 'function');
});

const createFirestoreFake = (events) => {
  const protocolReference = {
    id: 'protocol-1',
    async set(metadata) {
      events.push({ name: 'firestore.setMetadata', metadata });
    }
  };
  const protocols = {
    doc(id) {
      assert.equal(id, 'protocol-1');
      return protocolReference;
    }
  };

  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        doc(uid) {
          assert.equal(uid, 'user-1');
          return {
            collection(collectionName) {
              assert.equal(collectionName, 'protocols');
              return protocols;
            }
          };
        }
      };
    }
  };
};

test('stores the PDF before persisting protocol metadata', async () => {
  const events = [];
  const service = createProtocolService({
    firestore: createFirestoreFake(events),
    pdfStore: {
      async put(blobKey, pdfBuffer, metadata) {
        events.push({ name: 'pdfStore.put', blobKey, pdfBuffer, metadata });
      }
    },
    convertDocxToPdf: async () => Buffer.from('pdf'),
    templateDirectory: path.resolve(__dirname, '..'),
    createId: () => 'protocol-1'
  });

  const result = await service.generate({ uid: 'user-1', body: validBody });

  assert.equal(result.protocolId, 'protocol-1');
  assert.equal(result.fileName, 'Protokol_Jan_Kowalski_Wydanie.pdf');
  assert.deepEqual(events.map((event) => event.name), ['pdfStore.put', 'firestore.setMetadata']);
  assert.equal(events[1].metadata.blobKey, 'users/user-1/protocols/protocol-1.pdf');
  assert.equal(events[1].metadata.fileName, 'Protokol_Jan_Kowalski_Wydanie.pdf');
});

test('uses the zdanie suffix in the generated protocol filename', async () => {
  const events = [];
  const service = createProtocolService({
    firestore: createFirestoreFake(events),
    pdfStore: {
      async put(blobKey, pdfBuffer, metadata) {
        events.push({ name: 'pdfStore.put', blobKey, pdfBuffer, metadata });
      }
    },
    convertDocxToPdf: async () => Buffer.from('pdf'),
    templateDirectory: path.resolve(__dirname, '..'),
    createId: () => 'protocol-1'
  });

  const result = await service.generate({
    uid: 'user-1',
    body: { ...validBody, typProtokolu: 'zdanie' }
  });

  assert.equal(result.fileName, 'Protokol_Jan_Kowalski_Zdanie.pdf');
  assert.equal(events[1].metadata.fileName, 'Protokol_Jan_Kowalski_Zdanie.pdf');
});

test('archives a company-specific template under its main protocol type', async () => {
  const events = [];
  const service = createProtocolService({
    firestore: createFirestoreFake(events),
    pdfStore: {
      async put(blobKey, pdfBuffer, metadata) {
        events.push({ name: 'pdfStore.put', blobKey, pdfBuffer, metadata });
      }
    },
    convertDocxToPdf: async () => Buffer.from('pdf'),
    templateDirectory: path.resolve(__dirname, '..'),
    createId: () => 'protocol-1'
  });

  const result = await service.generate({
    uid: 'user-1',
    body: { ...validBody, typProtokolu: 'aterima_medusmo_wydanie' }
  });

  assert.equal(result.fileName, 'Protokol_Jan_Kowalski_Wydanie.pdf');
  assert.equal(events[1].metadata.type, 'wydanie');
});

test('removes an uploaded PDF when metadata persistence fails', async () => {
  const events = [];
  const firestore = createFirestoreFake(events);
  const originalCollection = firestore.collection;
  firestore.collection = (...args) => {
    const users = originalCollection(...args);
    const originalDoc = users.doc;
    users.doc = (...docArgs) => {
      const user = originalDoc(...docArgs);
      const originalProtocols = user.collection;
      user.collection = (...collectionArgs) => {
        const protocols = originalProtocols(...collectionArgs);
        const originalProtocolDoc = protocols.doc;
        protocols.doc = (...protocolDocArgs) => {
          const reference = originalProtocolDoc(...protocolDocArgs);
          reference.set = async () => {
            events.push({ name: 'firestore.setMetadata' });
            throw new Error('metadata failed');
          };
          return reference;
        };
        return protocols;
      };
      return user;
    };
    return users;
  };
  const service = createProtocolService({
    firestore,
    pdfStore: {
      async put() {
        events.push({ name: 'pdfStore.put' });
      },
      async delete(blobKey, options) {
        events.push({ name: 'pdfStore.delete', blobKey, options });
      }
    },
    convertDocxToPdf: async () => Buffer.from('pdf'),
    templateDirectory: path.resolve(__dirname, '..'),
    createId: () => 'protocol-1'
  });

  await assert.rejects(() => service.generate({ uid: 'user-1', body: validBody }), /metadata failed/);

  assert.deepEqual(events.map((event) => event.name), [
    'pdfStore.put',
    'firestore.setMetadata',
    'pdfStore.delete'
  ]);
  assert.equal(events[2].blobKey, 'users/user-1/protocols/protocol-1.pdf');
  assert.deepEqual(events[2].options, { ignoreMissing: true });
});

test('filters a user protocol list by the requested type', async () => {
  const firestore = {
    collection(name) {
      assert.equal(name, 'users');
      return {
        doc(uid) {
          assert.equal(uid, 'user-1');
          return {
            collection(collectionName) {
              assert.equal(collectionName, 'protocols');
              return {
                async get() {
                  return {
                    docs: [
                      {
                        id: 'old-issued',
                        data: () => ({
                          type: 'wydanie',
                          status: 'oczekujace',
                          fileName: 'old.pdf',
                          personName: 'Jan',
                          createdAt: new Date('2026-08-01T12:00:00.000Z')
                        })
                      },
                      {
                        id: 'new-returned',
                        data: () => ({
                          type: 'zdanie',
                          status: 'oczekujace',
                          fileName: 'new.pdf',
                          personName: 'Anna',
                          createdAt: new Date('2026-08-02T12:00:00.000Z')
                        })
                      }
                    ]
                  };
                }
              };
            }
          };
        }
      };
    }
  };
  const service = createProtocolService({ firestore });

  const protocols = await service.list({ uid: 'user-1', type: 'wydanie' });

  assert.deepEqual(protocols, [{
    id: 'old-issued',
    type: 'wydanie',
    status: 'oczekujace',
    fileName: 'old.pdf',
    personName: 'Jan',
    createdAt: '2026-08-01T12:00:00.000Z'
  }]);
});

test('downloads a PDF from the requesting user protocol', async () => {
  let requestedBlobKey;
  const service = createProtocolService({
    firestore: {
      collection: () => ({
        doc: (uid) => {
          assert.equal(uid, 'user-1');
          return {
            collection: () => ({
              doc: (protocolId) => {
                assert.equal(protocolId, 'protocol-1');
                return {
                  async get() {
                    return {
                      exists: true,
                      data: () => ({ fileName: 'jan.pdf', blobKey: 'users/user-1/protocols/protocol-1.pdf' })
                    };
                  }
                };
              }
            })
          };
        }
      })
    },
    pdfStore: {
      async get(blobKey) {
        requestedBlobKey = blobKey;
        return Buffer.from('pdf');
      }
    }
  });

  const download = await service.download({ uid: 'user-1', protocolId: 'protocol-1' });

  assert.equal(requestedBlobKey, 'users/user-1/protocols/protocol-1.pdf');
  assert.equal(download.fileName, 'jan.pdf');
  assert.deepEqual(download.pdfBuffer, Buffer.from('pdf'));
});

test('returns 404 when PDF storage has no file for an existing protocol', async () => {
  const service = createProtocolService({
    firestore: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              async get() {
                return {
                  exists: true,
                  data: () => ({
                    fileName: 'missing.pdf',
                    blobKey: 'users/user-1/protocols/missing.pdf'
                  })
                };
              }
            })
          })
        })
      })
    },
    pdfStore: { async get() { return null; } }
  });

  await assert.rejects(
    () => service.download({ uid: 'user-1', protocolId: 'missing' }),
    { status: 404, message: 'Nie znaleziono pliku PDF protokołu.' }
  );
});

test('returns 404 when PDF storage returns undefined for an existing protocol', async () => {
  const service = createProtocolService({
    firestore: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              async get() {
                return {
                  exists: true,
                  data: () => ({
                    fileName: 'missing.pdf',
                    blobKey: 'users/user-1/protocols/missing.pdf'
                  })
                };
              }
            })
          })
        })
      })
    },
    pdfStore: { async get() {} }
  });

  await assert.rejects(
    () => service.download({ uid: 'user-1', protocolId: 'missing' }),
    { status: 404, message: 'Nie znaleziono pliku PDF protokołu.' }
  );
});

test('downloads an existing PDF that was stored with the legacy storage path', async () => {
  let requestedBlobKey;
  const service = createProtocolService({
    firestore: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              async get() {
                return {
                  exists: true,
                  data: () => ({
                    fileName: 'legacy.pdf',
                    storagePath: 'users/user-1/protocols/legacy.pdf'
                  })
                };
              }
            })
          })
        })
      })
    },
    pdfStore: {
      async get(blobKey) {
        requestedBlobKey = blobKey;
        return Buffer.from('pdf');
      }
    }
  });

  await service.download({ uid: 'user-1', protocolId: 'legacy' });

  assert.equal(requestedBlobKey, 'users/user-1/protocols/legacy.pdf');
});

test('removes the PDF before deleting the requesting user protocol metadata', async () => {
  const events = [];
  const service = createProtocolService({
    firestore: {
      collection: () => ({
        doc: (uid) => {
          assert.equal(uid, 'user-1');
          return {
            collection: () => ({
              doc: (protocolId) => {
                assert.equal(protocolId, 'protocol-1');
                return {
                  async get() {
                    return {
                      exists: true,
                      data: () => ({ blobKey: 'users/user-1/protocols/protocol-1.pdf' })
                    };
                  },
                  async delete() {
                    events.push('firestore.deleteMetadata');
                  }
                };
              }
            })
          };
        }
      })
    },
    pdfStore: {
      async delete(blobKey, options) {
        assert.equal(blobKey, 'users/user-1/protocols/protocol-1.pdf');
        assert.deepEqual(options, { ignoreMissing: true });
        events.push('pdfStore.delete');
      }
    }
  });

  await service.complete({ uid: 'user-1', protocolId: 'protocol-1' });

  assert.deepEqual(events, ['pdfStore.delete', 'firestore.deleteMetadata']);
});
