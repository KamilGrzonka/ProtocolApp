const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const express = require('express');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

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
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    });

    return await fs.readFile(outputPdfPath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
};

app.use(express.json({ limit: '32kb' }));

app.get('/', (_request, response) => {
  response.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/protokoly/generuj', async (request, response) => {
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

    response
      .status(200)
      .type(pdfMimeType)
      .set('Content-Disposition', `attachment; filename="Protokol_${getSafeFileName(protocolData.ImieNazwisko)}.pdf"`)
      .send(pdfBuffer);
  } catch (error) {
    console.error('Generowanie PDF nie powiodło się:', error);

    if (error.code === 'ENOENT' && error.path === libreOfficeBinary) {
      return response.status(503).json({ error: 'Konwerter LibreOffice nie jest dostępny na serwerze.' });
    }

    if (error.code === 'ENOENT' && Object.values(templatePaths).includes(error.path)) {
      return response.status(500).json({ error: 'Nie znaleziono pliku szablonu DOCX na serwerze.' });
    }

    if (error.code === 'ETIMEDOUT') {
      return response.status(504).json({ error: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' });
    }

    return response.status(500).json({ error: 'Nie udało się wygenerować dokumentu PDF.' });
  }
});

app.listen(port, () => {
  console.log(`ProtocolApp działa pod adresem http://localhost:${port}`);
});
