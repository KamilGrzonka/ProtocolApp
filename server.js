const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
require('dotenv').config();
const express = require('express');
const { createProtocolApp } = require('./server/app.cjs');
const { getLibreOfficeTimeoutMs } = require('./server/conversion-config.cjs');
const { initializeFirebaseAdmin } = require('./server/firebase-admin.cjs');
const { createProtocolService } = require('./server/protocol-service.cjs');
const { createLocalPdfStore } = require('./server/storage/local.cjs');

const port = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const execFileAsync = promisify(execFile);
const bundledLibreOfficeBinary = path.join(
  rootDir,
  '.tools',
  'libreoffice',
  'program',
  process.platform === 'win32' ? 'soffice.com' : 'soffice'
);
const libreOfficeBinary = process.env.LIBREOFFICE_PATH || bundledLibreOfficeBinary;

const firebaseClientConfig = Object.freeze({
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
});

const convertDocxToPdf = async (docxBuffer) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'protocol-app-'));
  const inputDocxPath = path.join(temporaryDirectory, 'protokol.docx');
  const outputPdfPath = path.join(temporaryDirectory, 'protokol.pdf');
  const profileDirectory = path.join(temporaryDirectory, 'libreoffice-profile');

  try {
    await fs.writeFile(inputDocxPath, docxBuffer);
    await fs.mkdir(profileDirectory);
    await execFileAsync(libreOfficeBinary, [
      '--headless',
      '--nologo',
      '--nodefault',
      '--nofirststartwizard',
      '--nolockcheck',
      `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
      '--convert-to', 'pdf',
      '--outdir', temporaryDirectory,
      inputDocxPath
    ], {
      windowsHide: true,
      timeout: getLibreOfficeTimeoutMs(),
      maxBuffer: 1024 * 1024
    });
    return await fs.readFile(outputPdfPath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
};

const { firestore, verifyIdToken } = initializeFirebaseAdmin(process.env);
const protocolService = firestore
  ? createProtocolService({
    firestore,
    pdfStore: createLocalPdfStore({ rootDirectory: path.join(rootDir, 'storage', 'pdfs') }),
    convertDocxToPdf,
    templateDirectory: rootDir,
    createId: () => firestore.collection('protocolIds').doc().id
  })
  : null;

if (!protocolService) {
  console.warn('Firebase jest nieaktywny: uzupełnij dane Admin SDK w pliku .env.');
}

const app = express();
app.use(express.static(path.join(rootDir, 'public')));
app.use(createProtocolApp({ protocolService, verifyIdToken, firebaseClientConfig }));

app.listen(port, () => {
  console.log(`ProtocolApp działa pod adresem http://localhost:${port}`);
});
