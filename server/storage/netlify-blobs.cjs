const toArrayBuffer = (buffer) => buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength
);

const createNetlifyBlobsPdfStore = ({ getStore, storeName = 'protocol-pdfs' }) => {
  const store = getStore(storeName);

  return {
    async put(key, buffer, metadata) {
      await store.set(key, toArrayBuffer(buffer), { metadata });
    },

    async get(key) {
      const pdfBytes = await store.get(key, { type: 'arrayBuffer' });
      return pdfBytes === null ? null : Buffer.from(pdfBytes);
    },

    async delete(key, _options = {}) {
      await store.delete(key);
    }
  };
};

module.exports = { createNetlifyBlobsPdfStore };
