const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createProtocolApp } = require('../server/app.cjs');

const validBody = {
  typProtokolu: 'wydanie',
  ImieNazwisko: 'Jan Kowalski'
};

test('does not invoke protocol generation without an exact Bearer token', async () => {
  let serviceWasCalled = false;
  const app = createProtocolApp({
    verifyIdToken: async () => { throw new Error('must not be called'); },
    protocolService: {
      async generate() {
        serviceWasCalled = true;
      }
    },
    firebaseClientConfig: {}
  });

  const response = await request(app)
    .post('/api/protokoly/generuj')
    .send(validBody);

  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Wymagane jest zalogowanie.');
  assert.equal(serviceWasCalled, false);
});
