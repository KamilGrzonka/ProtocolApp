const { HttpError } = require('./http-error.cjs');

const WORKER_FETCH_TIMEOUT_MS = 45_000;
const workerUnavailableMessage = 'Konwerter PDF jest chwilowo niedostępny.';
const workerTimeoutMessage = 'Konwersja dokumentu do PDF przekroczyła limit czasu.';

const createWorkerPdfConverter = ({
  workerUrl,
  workerSecret,
  fetchImpl = fetch,
  createTimeoutSignal = AbortSignal.timeout
}) => async (docxBuffer) => {
  if (!workerUrl || !workerSecret) {
    throw new HttpError(503, workerUnavailableMessage);
  }

  const timeoutSignal = createTimeoutSignal(WORKER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${workerUrl.replace(/\/$/, '')}/convert`, {
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

module.exports = {
  WORKER_FETCH_TIMEOUT_MS,
  createWorkerPdfConverter
};
