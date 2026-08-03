const assert = require('node:assert/strict');
const test = require('node:test');
const {
  WORKER_FETCH_TIMEOUT_MS,
  createWorkerPdfConverter
} = require('../server/worker-client.cjs');

test('uses a 55-second timeout for a PDF worker conversion request', async () => {
  const pdf = Buffer.from('%PDF-1.7');
  let observedTimeout;
  let observedRequest;
  const convertDocxToPdf = createWorkerPdfConverter({
    workerUrl: 'https://worker.example/',
    workerSecret: 'test-worker-secret',
    createTimeoutSignal(timeoutMs) {
      observedTimeout = timeoutMs;
      return new AbortController().signal;
    },
    async fetchImpl(url, request) {
      observedRequest = { url, request };
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength)
      };
    }
  });

  const result = await convertDocxToPdf(Buffer.from('DOCX'));

  assert.equal(WORKER_FETCH_TIMEOUT_MS, 55_000);
  assert.equal(observedTimeout, 55_000);
  assert.equal(observedRequest.url, 'https://worker.example/convert');
  assert.equal(observedRequest.request.headers['X-Worker-Secret'], 'test-worker-secret');
  assert.deepEqual(result, pdf);
});

test('maps an elapsed worker-client timeout to a controlled 504 response', async () => {
  const convertDocxToPdf = createWorkerPdfConverter({
    workerUrl: 'https://worker.example',
    workerSecret: 'test-worker-secret',
    createTimeoutSignal: () => AbortSignal.abort(),
    fetchImpl: async () => { throw new Error('fetch aborted'); }
  });

  await assert.rejects(
    () => convertDocxToPdf(Buffer.from('DOCX')),
    { status: 504, message: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' }
  );
});
