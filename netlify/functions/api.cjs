const path = require('node:path');
const { getStore } = require('@netlify/blobs');
const serverless = require('serverless-http');
const { createProtocolApp } = require('../../server/app.cjs');
const { initializeFirebaseAdmin } = require('../../server/firebase-admin.cjs');
const { createProtocolService } = require('../../server/protocol-service.cjs');
const { createNetlifyBlobsPdfStore } = require('../../server/storage/netlify-blobs.cjs');
const { createWorkerPdfConverter } = require('../../server/worker-client.cjs');

const firebaseClientConfig = Object.freeze({
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
});

const convertDocxToPdf = createWorkerPdfConverter({
  workerUrl: process.env.PDF_WORKER_URL,
  workerSecret: process.env.PDF_WORKER_SECRET
});

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
