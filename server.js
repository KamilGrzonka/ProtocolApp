const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
require('dotenv').config();
const express = require('express');
const Docxtemplater = require('docxtemplater');
const admin = require('firebase-admin');
const PizZip = require('pizzip');
const { getLibreOfficeTimeoutMs } = require('./server/conversion-config.cjs');

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
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
});

let firestore = null;
let storageBucket = null;
let firebaseReady = false;

const initializeFirebase = () => {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const hasAdminCredentials = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    privateKey
  );

  if (!hasAdminCredentials || !process.env.FIREBASE_STORAGE_BUCKET) {
    console.warn('Firebase jest nieaktywny: uzupełnij dane Admin SDK w pliku .env.');
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });

  firestore = admin.firestore();
  storageBucket = admin.storage().bucket();
  firebaseReady = true;
};

initializeFirebase();

const templatePaths = Object.freeze({
  wydanie: path.join(rootDir, 'szablon_wydanie.docx'),
  zdanie: path.join(rootDir, 'szablon_zdanie.docx')
});

const requiredFields = [
  'ImieNazwisko',
  'PESEL',
  'Data',
  'ModelKomputera',
  'NumerSerwisowy',
  'Ladowarka',
  'Monitor',
  'Klawiatura',
  'Mysz',
  'Sluchawki',
  'Wartosc',
  'Uwagi'
];

const getSafeFileName = (name) => {
  const safeName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safeName || 'Uzytkownik';
};

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
    request.user = await admin.auth().verifyIdToken(token);
    return next();
  } catch (error) {
    console.error('Weryfikacja Firebase ID token nie powiodła się:', error.message);
    return response.status(401).json({ error: 'Sesja logowania jest nieprawidłowa lub wygasła.' });
  }
};

const userProtocols = (uid) => firestore.collection('users').doc(uid).collection('protocols');

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
  const { typProtokolu, ...protocolData } = request.body || {};

  if (!Object.prototype.hasOwnProperty.call(templatePaths, typProtokolu)) {
    return response.status(400).json({ error: 'Nieprawidłowy typ protokołu.' });
  }

  const missingFields = requiredFields.filter((field) => {
    return typeof protocolData[field] !== 'string';
  });

  if (missingFields.length > 0) {
    return response.status(400).json({
      error: `Brak wymaganych pól: ${missingFields.join(', ')}.`
    });
  }

  try {
    const templateBuffer = await fs.readFile(templatePaths[typProtokolu]);
    const zip = new PizZip(templateBuffer);
    const document = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    document.render(protocolData);

    const docxBuffer = document.getZip().generate({
      type: 'nodebuffer',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const pdfBuffer = await convertDocxToPdf(docxBuffer);
    const protocolReference = userProtocols(request.user.uid).doc();
    const storagePath = `users/${request.user.uid}/protocols/${protocolReference.id}.pdf`;
    const fileName = `Protokol_${getSafeFileName(protocolData.ImieNazwisko)}.pdf`;

    await storageBucket.file(storagePath).save(pdfBuffer, {
      resumable: false,
      metadata: {
        contentType: pdfMimeType,
        metadata: {
          uid: request.user.uid,
          protocolId: protocolReference.id
        }
      }
    });

    await protocolReference.set({
      type: typProtokolu,
      status: 'oczekujace',
      fileName,
      storagePath,
      personName: protocolData.ImieNazwisko,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    response
      .status(200)
      .type(pdfMimeType)
      .set('Content-Disposition', `attachment; filename="${fileName}"`)
      .set('X-Protocol-Id', protocolReference.id)
      .send(pdfBuffer);
  } catch (error) {
    console.error('Generowanie PDF nie powiodło się:', error);

    if (error.code === 'ENOENT' && error.path === libreOfficeBinary) {
      return response.status(503).json({ error: 'Konwerter LibreOffice nie jest dostępny na serwerze.' });
    }

    if (error.code === 'ENOENT' && Object.values(templatePaths).includes(error.path)) {
      return response.status(500).json({ error: 'Nie znaleziono pliku szablonu DOCX na serwerze.' });
    }

    if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
      return response.status(504).json({ error: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' });
    }

    return response.status(500).json({ error: 'Nie udało się wygenerować dokumentu PDF.' });
  }
});

app.get('/api/protokoly', requireFirebase, requireUser, async (request, response) => {
  try {
    const snapshot = await userProtocols(request.user.uid).get();
    const requestedType = request.query.type;
    const protocols = snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          id: document.id,
          type: data.type,
          status: data.status,
          fileName: data.fileName,
          personName: data.personName,
          createdAt: data.createdAt?.toDate?.().toISOString() || null
        };
      })
      .filter((protocol) => !requestedType || requestedType === 'all' || protocol.type === requestedType)
      .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));

    return response.json(protocols);
  } catch (error) {
    console.error('Nie udało się pobrać listy protokołów:', error);
    return response.status(500).json({ error: 'Nie udało się pobrać listy protokołów.' });
  }
});

app.get('/api/protokoly/:id/download', requireFirebase, requireUser, async (request, response) => {
  try {
    const protocolReference = userProtocols(request.user.uid).doc(request.params.id);
    const protocolSnapshot = await protocolReference.get();

    if (!protocolSnapshot.exists) {
      return response.status(404).json({ error: 'Nie znaleziono protokołu.' });
    }

    const protocol = protocolSnapshot.data();
    const [pdfBuffer] = await storageBucket.file(protocol.storagePath).download();

    return response
      .type(pdfMimeType)
      .set('Content-Disposition', `attachment; filename="${protocol.fileName}"`)
      .send(pdfBuffer);
  } catch (error) {
    console.error('Nie udało się pobrać protokołu:', error);
    return response.status(500).json({ error: 'Nie udało się pobrać protokołu.' });
  }
});

app.patch('/api/protokoly/:id/status', requireFirebase, requireUser, async (request, response) => {
  if (request.body?.status !== 'zakonczone') {
    return response.status(400).json({ error: 'Nieprawidłowy status protokołu.' });
  }

  try {
    const protocolReference = userProtocols(request.user.uid).doc(request.params.id);
    const protocolSnapshot = await protocolReference.get();

    if (!protocolSnapshot.exists) {
      return response.status(404).json({ error: 'Nie znaleziono protokołu.' });
    }

    const protocol = protocolSnapshot.data();
    await storageBucket.file(protocol.storagePath).delete({ ignoreNotFound: true });
    await protocolReference.delete();

    return response.status(204).send();
  } catch (error) {
    console.error('Nie udało się zakończyć protokołu:', error);
    return response.status(500).json({ error: 'Nie udało się usunąć protokołu z listy.' });
  }
});

app.listen(port, () => {
  console.log(`ProtocolApp działa pod adresem http://localhost:${port}`);
});
