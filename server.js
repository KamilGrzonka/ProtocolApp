const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
require('dotenv').config();
const express = require('express');
const { getLibreOfficeTimeoutMs } = require('./server/conversion-config.cjs');
const { initializeFirebaseAdmin } = require('./server/firebase-admin.cjs');
const { HttpError } = require('./server/http-error.cjs');
const { createProtocolService } = require('./server/protocol-service.cjs');
const { createLocalPdfStore } = require('./server/storage/local.cjs');

const app = express();
const port = Number(process.env.PORT) || 3000;
const execFileAsync = promisify(execFile);
const rootDir = __dirname;
const bundledLibreOfficeBinary = path.join(
  rootDir,
  '.tools',
  'libreoffice',
  'program',
  process.platform === 'win32' ? 'soffice.com' : 'soffice'
);
const libreOfficeBinary = process.env.LIBREOFFICE_PATH || bundledLibreOfficeBinary;
const pdfMimeType = 'application/pdf';

const firebaseClientConfig = Object.freeze({
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
});

const { firestore, verifyIdToken } = initializeFirebaseAdmin(process.env);
const firebaseReady = Boolean(firestore);

if (!firebaseReady) {
  console.warn('Firebase jest nieaktywny: uzupełnij dane Admin SDK w pliku .env.');
}

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

const pdfStore = createLocalPdfStore({
  rootDirectory: path.join(rootDir, 'storage', 'pdfs')
});

const protocolService = firebaseReady
  ? createProtocolService({
    firestore,
    pdfStore,
    convertDocxToPdf,
    templateDirectory: rootDir,
    createId: () => firestore.collection('protocolIds').doc().id
  })
  : null;

const requireFirebase = (_request, response, next) => {
  if (!firebaseReady) {
    return response.status(503).json({ error: 'Firebase nie jest skonfigurowany na serwerze.' });
  }

  return next();
};

const requireUser = async (request, response, next) => {
  const authorization = request.get('authorization') || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!token) {
    return response.status(401).json({ error: 'Wymagane jest zalogowanie.' });
  }

  try {
    request.user = await verifyIdToken(token);
    return next();
  } catch (error) {
    console.error('Weryfikacja Firebase ID token nie powiodła się:', error.message);
    return response.status(401).json({ error: 'Sesja logowania jest nieprawidłowa lub wygasła.' });
  }
};

const sendGenerateError = (error, response) => {
  if (error instanceof HttpError) {
    return response.status(error.status).json({ error: error.message });
  }

  console.error('Generowanie PDF nie powiodło się:', error);

  if (error.code === 'ENOENT' && error.path === libreOfficeBinary) {
    return response.status(503).json({ error: 'Konwerter LibreOffice nie jest dostępny na serwerze.' });
  }

  if (error.code === 'ENOENT' && error.path?.startsWith(rootDir)) {
    return response.status(500).json({ error: 'Nie znaleziono pliku szablonu DOCX na serwerze.' });
  }

  if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
    return response.status(504).json({ error: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' });
  }

  return response.status(500).json({ error: 'Nie udało się wygenerować dokumentu PDF.' });
};

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(rootDir, 'public')));

app.get('/', (_request, response) => {
  response.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', firebase: firebaseReady });
});

app.get('/api/firebase-config', (_request, response) => {
  response.json(firebaseClientConfig);
});

app.post('/api/protokoly/generuj', requireFirebase, requireUser, async (request, response) => {
  try {
    const { pdfBuffer, fileName, protocolId } = await protocolService.generate({
      uid: request.user.uid,
      body: request.body
    });

    return response
      .status(200)
      .type(pdfMimeType)
      .set('Content-Disposition', `attachment; filename="${fileName}"`)
      .set('X-Protocol-Id', protocolId)
      .send(pdfBuffer);
  } catch (error) {
    return sendGenerateError(error, response);
  }
});

app.get('/api/protokoly', requireFirebase, requireUser, async (request, response) => {
  try {
    return response.json(await protocolService.list({
      uid: request.user.uid,
      type: request.query.type
    }));
  } catch (error) {
    console.error('Nie udało się pobrać listy protokołów:', error);
    return response.status(500).json({ error: 'Nie udało się pobrać listy protokołów.' });
  }
});

app.get('/api/protokoly/:id/download', requireFirebase, requireUser, async (request, response) => {
  try {
    const { pdfBuffer, fileName } = await protocolService.download({
      uid: request.user.uid,
      protocolId: request.params.id
    });

    return response
      .type(pdfMimeType)
      .set('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(pdfBuffer);
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ error: error.message });
    }

    console.error('Nie udało się pobrać protokołu:', error);
    return response.status(500).json({ error: 'Nie udało się pobrać protokołu.' });
  }
});

app.patch('/api/protokoly/:id/status', requireFirebase, requireUser, async (request, response) => {
  if (request.body?.status !== 'zakonczone') {
    return response.status(400).json({ error: 'Nieprawidłowy status protokołu.' });
  }

  try {
    await protocolService.complete({ uid: request.user.uid, protocolId: request.params.id });
    return response.status(204).send();
  } catch (error) {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ error: error.message });
    }

    console.error('Nie udało się zakończyć protokołu:', error);
    return response.status(500).json({ error: 'Nie udało się usunąć protokołu z listy.' });
  }
});

app.listen(port, () => {
  console.log(`ProtocolApp działa pod adresem http://localhost:${port}`);
});
