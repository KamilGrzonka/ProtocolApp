const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError } = require('../server/http-error.cjs');
const { validateProtocolRequest } = require('../server/protocol-template.cjs');

test('rejects an unsupported protocol type', () => {
  assert.throws(
    () => validateProtocolRequest({ typProtokolu: 'inne' }),
    new HttpError(400, 'Nieprawidłowy typ protokołu.')
  );
});
