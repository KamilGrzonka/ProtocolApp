const { HttpError } = require('./http-error.cjs');
const { renderProtocolDocx, validateProtocolRequest } = require('./protocol-template.cjs');

const pdfMimeType = 'application/pdf';

const getSafeFileName = (name) => {
  const safeName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safeName || 'Uzytkownik';
};

const protocolTypeLabels = Object.freeze({
  wydanie: 'Wydanie',
  zdanie: 'Zdanie'
});

const toIsoString = (createdAt) => {
  if (!createdAt) return null;
  if (typeof createdAt.toDate === 'function') return createdAt.toDate().toISOString();
  if (typeof createdAt.toISOString === 'function') return createdAt.toISOString();
  return null;
};

const getBlobKey = (protocol) => protocol.blobKey || protocol.storagePath;

const createProtocolService = ({
  firestore,
  pdfStore,
  convertDocxToPdf,
  templateDirectory,
  createId
}) => {
  const userProtocols = (uid) => firestore.collection('users').doc(uid).collection('protocols');

  const getProtocolReference = (uid, protocolId) => userProtocols(uid).doc(protocolId);

  const getProtocol = async (uid, protocolId) => {
    const protocolReference = getProtocolReference(uid, protocolId);
    const protocolSnapshot = await protocolReference.get();

    if (!protocolSnapshot.exists) {
      throw new HttpError(404, 'Nie znaleziono protokołu.');
    }

    return { protocolReference, protocol: protocolSnapshot.data() };
  };

  return {
    async generate({ uid, body }) {
      const { typProtokolu, templateFileName, protocolData } = validateProtocolRequest(body);
      const docxBuffer = await renderProtocolDocx({
        templateFileName,
        protocolData,
        templateDirectory
      });
      const pdfBuffer = await convertDocxToPdf(docxBuffer);
      const protocolId = createId();
      const blobKey = `users/${uid}/protocols/${protocolId}.pdf`;
      const fileName = `Protokol_${getSafeFileName(protocolData.ImieNazwisko)}_${protocolTypeLabels[typProtokolu]}.pdf`;
      const protocolReference = getProtocolReference(uid, protocolId);
      const metadata = {
        type: typProtokolu,
        status: 'oczekujace',
        fileName,
        blobKey,
        personName: protocolData.ImieNazwisko,
        createdAt: new Date()
      };

      await pdfStore.put(blobKey, pdfBuffer, {
        contentType: pdfMimeType,
        metadata: { uid, protocolId }
      });

      try {
        await protocolReference.set(metadata);
      } catch (error) {
        try {
          await pdfStore.delete(blobKey, { ignoreMissing: true });
        } catch (cleanupError) {
          error.cleanupError = cleanupError;
        }
        throw error;
      }

      return { pdfBuffer, fileName, protocolId };
    },

    async list({ uid, type }) {
      const snapshot = await userProtocols(uid).get();

      return snapshot.docs
        .map((document) => {
          const data = document.data();
          return {
            id: document.id,
            type: data.type,
            status: data.status,
            fileName: data.fileName,
            personName: data.personName,
            createdAt: toIsoString(data.createdAt)
          };
        })
        .filter((protocol) => !type || type === 'all' || protocol.type === type)
        .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));
    },

    async download({ uid, protocolId }) {
      const { protocol } = await getProtocol(uid, protocolId);
      const pdfBuffer = await pdfStore.get(getBlobKey(protocol));

      if (pdfBuffer == null) {
        throw new HttpError(404, 'Nie znaleziono pliku PDF protokołu.');
      }

      return { pdfBuffer, fileName: protocol.fileName };
    },

    async complete({ uid, protocolId }) {
      const { protocolReference, protocol } = await getProtocol(uid, protocolId);
      await pdfStore.delete(getBlobKey(protocol), { ignoreMissing: true });
      await protocolReference.delete();
    }
  };
};

module.exports = { createProtocolService };
