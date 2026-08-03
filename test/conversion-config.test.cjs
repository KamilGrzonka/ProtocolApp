const test = require('node:test');
const assert = require('node:assert/strict');
const { getLibreOfficeTimeoutMs } = require('../server/conversion-config.cjs');

test('uses a 120 second default timeout for LibreOffice conversion', () => {
  const previous = process.env.LIBREOFFICE_TIMEOUT_MS;
  delete process.env.LIBREOFFICE_TIMEOUT_MS;

  try {
    assert.equal(getLibreOfficeTimeoutMs(), 120_000);
  } finally {
    if (previous === undefined) delete process.env.LIBREOFFICE_TIMEOUT_MS;
    else process.env.LIBREOFFICE_TIMEOUT_MS = previous;
  }
});
