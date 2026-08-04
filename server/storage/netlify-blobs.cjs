const toArrayBuffer = (buffer) => buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength
);

const createNetlifyBlobsPdfStore = ({ getStore, storeName = 'protocol-pdfs' }) => {
  const getConfiguredStore = () => getStore(storeName);

  return {
    async put(key, buffer, metadata) {
      await getConfiguredStore().set(key, toArrayBuffer(buffer), { metadata });
    },

    async get(key) {
      const pdfBytes = await getConfiguredStore().get(key, { type: 'arrayBuffer' });
      return pdfBytes === null ? null : Buffer.from(pdfBytes);
    },

    async delete(key, _options = {}) {
      await getConfiguredStore().delete(key);
    }
  };
};

module.exports = { createNetlifyBlobsPdfStore };
