const fs = require('node:fs/promises');
const path = require('node:path');

const createLocalPdfStore = ({ rootDirectory }) => {
  const resolvedRootDirectory = path.resolve(rootDirectory);

  const resolveFilePath = (key) => {
    const filePath = path.resolve(resolvedRootDirectory, key);
    const relativePath = path.relative(resolvedRootDirectory, filePath);

    if (
      relativePath === '' ||
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error('PDF storage key must resolve below the local storage root.');
    }

    return filePath;
  };

  return {
    async put(key, buffer, _metadata) {
      const filePath = resolveFilePath(key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);
    },

    async get(key) {
      try {
        return await fs.readFile(resolveFilePath(key));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },

    async delete(key, { ignoreMissing = false } = {}) {
      try {
        await fs.unlink(resolveFilePath(key));
      } catch (error) {
        if (error.code === 'ENOENT' && ignoreMissing) return;
        throw error;
      }
    }
  };
};

module.exports = { createLocalPdfStore };
