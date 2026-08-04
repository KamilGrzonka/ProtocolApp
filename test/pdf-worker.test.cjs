const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createPdfWorker } = require('../pdf-worker/server.cjs');

const workerSecret = 'test-worker-secret';
const validDocxBase64 = Buffer.from('PK\x03\x04fixture').toString('base64');

test('reports that the worker is healthy', async () => {
  const app = createPdfWorker({
    convertDocxToPdf: async () => Buffer.from('%PDF-1.7'),
    workerSecret
  });

  const response = await request(app).get('/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('rejects conversion without the worker secret', async () => {
  const app = createPdfWorker({
    convertDocxToPdf: async () => Buffer.from('%PDF-1.7'),
    workerSecret
  });

  const response = await request(app)
    .post('/convert')
    .send({ docxBase64: validDocxBase64 });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Nieprawidłowy sekret workera.');
});

test('rejects conversion with an incorrect worker secret', async () => {
  const app = createPdfWorker({
    convertDocxToPdf: async () => Buffer.from('%PDF-1.7'),
    workerSecret
  });

  const response = await request(app)
    .post('/convert')
    .set('X-Worker-Secret', 'incorrect-secret')
    .send({ docxBase64: validDocxBase64 });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Nieprawidłowy sekret workera.');
});

test('rejects a malformed DOCX payload', async () => {
  const app = createPdfWorker({
    convertDocxToPdf: async () => Buffer.from('%PDF-1.7'),
    workerSecret
  });

  const response = await request(app)
    .post('/convert')
    .set('X-Worker-Secret', workerSecret)
    .send({ docxBase64: Buffer.from('not-a-zip').toString('base64') });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Nieprawidłowy dokument DOCX.');
});

test('rejects a syntactically invalid base64 DOCX payload', async () => {
  const app = createPdfWorker({
    convertDocxToPdf: async () => Buffer.from('%PDF-1.7'),
    workerSecret
  });

  const response = await request(app)
    .post('/convert')
    .set('X-Worker-Secret', workerSecret)
    .send({ docxBase64: 'not valid base64!' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Nieprawidłowy dokument DOCX.');
});

test('returns PDF bytes from the converter for a valid DOCX', async () => {
  const app = createPdfWorker({
    convertDocxToPdf: async () => Buffer.from('%PDF-1.7\nfixture'),
    workerSecret
  });

  const response = await request(app)
    .post('/convert')
    .set('X-Worker-Secret', workerSecret)
    .send({ docxBase64: validDocxBase64 });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.equal(response.body.subarray(0, 5).toString(), '%PDF-');
});

test('maps a conversion timeout to a gateway timeout response', async () => {
  const timeout = new Error('converter timed out');
  timeout.code = 'ETIMEDOUT';
  const app = createPdfWorker({
    convertDocxToPdf: async () => { throw timeout; },
    workerSecret
  });

  const response = await request(app)
    .post('/convert')
    .set('X-Worker-Secret', workerSecret)
    .send({ docxBase64: validDocxBase64 });

  assert.equal(response.status, 504);
  assert.equal(response.body.error, 'Konwersja dokumentu do PDF przekroczyła limit czasu.');
});
