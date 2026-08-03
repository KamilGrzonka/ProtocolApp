'use strict';

const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const express = require('express');

const DEFAULT_CONVERSION_TIMEOUT_MS = 120_000;
const MALFORMED_DOCX_MESSAGE = 'Nieprawidłowy dokument DOCX.';
const TIMEOUT_MESSAGE = 'Konwersja dokumentu do PDF przekroczyła limit czasu.';

function isValidWorkerSecret(receivedSecret, workerSecret) {
  if (typeof receivedSecret !== 'string' || typeof workerSecret !== 'string') {
    return false;
  }

  const receivedHash = crypto.createHash('sha256').update(receivedSecret, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(workerSecret, 'utf8').digest();
  return crypto.timingSafeEqual(receivedHash, expectedHash);
}

function decodeDocxBase64(docxBase64) {
  if (
    typeof docxBase64 !== 'string' ||
    docxBase64.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(docxBase64)
  ) {
    return null;
  }

  const docx = Buffer.from(docxBase64, 'base64');
  return docx.length > 0 && docx[0] === 0x50 && docx[1] === 0x4b ? docx : null;
}

function isConversionTimeout(error) {
  return error?.code === 'ETIMEDOUT' ||
    error?.code === 'CONVERSION_TIMEOUT' ||
    error?.signal === 'SIGTERM';
}

function runSoffice({ command, argumentsList, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timer.unref();

    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (timedOut || signal === 'SIGTERM') {
        const error = new Error('LibreOffice conversion timed out');
        error.code = 'CONVERSION_TIMEOUT';
        error.signal = signal;
        reject(error);
      } else if (exitCode !== 0) {
        reject(new Error('LibreOffice conversion failed'));
      } else {
        resolve();
      }
    });
  });
}

function createProductionConverter({
  sofficeCommand = 'soffice',
  timeoutMs = DEFAULT_CONVERSION_TIMEOUT_MS
} = {}) {
  return async function convertDocxToPdf(docx) {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'protocol-pdf-'));
    const inputPath = path.join(temporaryDirectory, 'protokol.docx');
    const outputPath = path.join(temporaryDirectory, 'protokol.pdf');
    const profileDirectory = path.join(temporaryDirectory, 'libreoffice-profile');

    try {
      await fs.mkdir(profileDirectory);
      await fs.writeFile(inputPath, docx);
      await runSoffice({
        command: sofficeCommand,
        argumentsList: [
          `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
          '--headless',
          '--convert-to', 'pdf',
          '--outdir', temporaryDirectory,
          inputPath
        ],
        timeoutMs
      });
      return await fs.readFile(outputPath);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

function createPdfWorker({ convertDocxToPdf, workerSecret }) {
  if (typeof convertDocxToPdf !== 'function') {
    throw new TypeError('convertDocxToPdf must be a function');
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post('/convert', async (request, response) => {
    if (!isValidWorkerSecret(request.get('X-Worker-Secret'), workerSecret)) {
      return response.status(401).json({ error: 'Nieprawidłowy sekret workera.' });
    }

    const docx = decodeDocxBase64(request.body?.docxBase64);
    if (!docx) {
      return response.status(400).json({ error: MALFORMED_DOCX_MESSAGE });
    }

    try {
      const pdf = await convertDocxToPdf(docx);
      return response.type('application/pdf').send(pdf);
    } catch (error) {
      const statusCode = isConversionTimeout(error) ? 504 : 500;
      const category = statusCode === 504 ? 'timeout' : 'conversion-failure';
      console.error('PDF conversion failed', { category, statusCode });
      return response.status(statusCode).json({
        error: statusCode === 504 ? TIMEOUT_MESSAGE : 'Nie udało się przekonwertować dokumentu do PDF.'
      });
    }
  });

  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: 'Żądanie jest zbyt duże.' });
    }
    return response.status(400).json({ error: MALFORMED_DOCX_MESSAGE });
  });

  return app;
}

if (require.main === module) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret) {
    console.error('WORKER_SECRET is required');
    process.exit(1);
  }

  const app = createPdfWorker({
    convertDocxToPdf: createProductionConverter(),
    workerSecret
  });
  const port = Number(process.env.PORT || 8080);
  app.listen(port, '0.0.0.0', () => console.log(`PDF worker listening on port ${port}`));
}

module.exports = { createPdfWorker, createProductionConverter };
