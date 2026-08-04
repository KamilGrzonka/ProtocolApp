const express = require('express');
const { HttpError } = require('./http-error.cjs');

const pdfMimeType = 'application/pdf';

const safeAttachmentName = (fileName) => {
  const normalized = String(fileName || 'protokol.pdf')
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/]/g, '_')
    .trim();

  return normalized || 'protokol.pdf';
};

const sendPdf = (response, { pdfBuffer, fileName, protocolId }) => {
  response
    .type(pdfMimeType)
    .set('Content-Disposition', `attachment; filename="${safeAttachmentName(fileName)}"`);

  if (protocolId) response.set('X-Protocol-Id', protocolId);

  return response.send(pdfBuffer);
};

const sendGenerateError = (error, response) => {
  if (error instanceof HttpError) {
    return response.status(error.status).json({ error: error.message });
  }

  console.error('Generowanie PDF nie powiodło się:', error);

  if (error?.code === 'ENOENT' && /szablon_(wydanie|zdanie)\.docx$/i.test(error.path || '')) {
    return response.status(500).json({ error: 'Nie znaleziono pliku szablonu DOCX na serwerze.' });
  }

  if (error?.code === 'ENOENT') {
    return response.status(503).json({ error: 'Konwerter LibreOffice nie jest dostępny na serwerze.' });
  }

  if (error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM') {
    return response.status(504).json({ error: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' });
  }

  return response.status(500).json({ error: 'Nie udało się wygenerować dokumentu PDF.' });
};

const createProtocolApp = ({ protocolService, verifyIdToken, firebaseClientConfig }) => {
  const app = express();
  const firebaseReady = Boolean(protocolService);

  const requireFirebase = (_request, response, next) => {
    if (!firebaseReady) {
      return response.status(503).json({ error: 'Firebase nie jest skonfigurowany na serwerze.' });
    }

    return next();
  };

  const requireUser = async (request, response, next) => {
    const authorization = request.get('authorization') || '';
    const bearerMatch = /^Bearer ([^\s]+)$/.exec(authorization);

    if (!bearerMatch) {
      return response.status(401).json({ error: 'Wymagane jest zalogowanie.' });
    }

    try {
      const user = await verifyIdToken(bearerMatch[1]);
      request.user = { uid: user.uid };
      return next();
    } catch (error) {
      console.error('Weryfikacja Firebase ID token nie powiodła się:', error.message);
      return response.status(401).json({ error: 'Sesja logowania jest nieprawidłowa lub wygasła.' });
    }
  };

  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', firebase: firebaseReady });
  });

  app.get('/api/firebase-config', (_request, response) => {
    response.json(firebaseClientConfig);
  });

  app.post('/api/protokoly/generuj', requireFirebase, requireUser, async (request, response) => {
    try {
      const generatedProtocol = await protocolService.generate({
        uid: request.user.uid,
        body: request.body
      });

      return sendPdf(response, generatedProtocol);
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
      return sendPdf(response, await protocolService.download({
        uid: request.user.uid,
        protocolId: request.params.id
      }));
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

  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'Nieprawidłowy format żądania.' });
    }
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: 'Żądanie jest zbyt duże.' });
    }
    return response.status(500).json({ error: 'Wystąpił nieoczekiwany błąd serwera.' });
  });

  return app;
};

module.exports = { createProtocolApp };
