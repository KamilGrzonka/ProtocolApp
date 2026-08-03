const path = require('node:path');
const { getStore } = require('@netlify/blobs');
const serverless = require('serverless-http');
const { createProtocolApp } = require('../../server/app.cjs');
const { initializeFirebaseAdmin } = require('../../server/firebase-admin.cjs');
const { HttpError } = require('../../server/http-error.cjs');
const { createProtocolService } = require('../../server/protocol-service.cjs');
const { createNetlifyBlobsPdfStore } = require('../../server/storage/netlify-blobs.cjs');

const workerUnavailableMessage = 'Konwerter PDF jest chwilowo niedostępny.';
const workerTimeoutMessage = 'Konwersja dokumentu do PDF przekroczyła limit czasu.';

const firebaseClientConfig = Object.freeze({
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
});

const convertDocxToPdf = async (docxBuffer) => {
  const workerUrl = process.env.PDF_WORKER_URL;
  const workerSecret = process.env.PDF_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new HttpError(503, workerUnavailableMessage);
  }

  const timeoutSignal = AbortSignal.timeout(150_000);

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': workerSecret
      },
      body: JSON.stringify({ docxBase64: docxBuffer.toString('base64') }),
      signal: timeoutSignal
    });

    if (response.status === 504) {
      throw new HttpError(504, workerTimeoutMessage);
    }

    if (!response.ok) {
      throw new HttpError(503, workerUnavailableMessage);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (timeoutSignal.aborted) throw new HttpError(504, workerTimeoutMessage);
    throw new HttpError(503, workerUnavailableMessage);
  }
};

const { firestore, verifyIdToken } = initializeFirebaseAdmin(process.env);
const protocolService = firestore
  ? createProtocolService({
    firestore,
    pdfStore: createNetlifyBlobsPdfStore({ getStore, storeName: 'protocol-pdfs' }),
    convertDocxToPdf,
    templateDirectory: path.resolve(__dirname, '../..'),
    createId: () => firestore.collection('protocolIds').doc().id
  })
  : null;

const app = createProtocolApp({ protocolService, verifyIdToken, firebaseClientConfig });

exports.handler = serverless(app, { binary: ['application/pdf'] });
