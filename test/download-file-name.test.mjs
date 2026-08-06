import test from 'node:test';
import assert from 'node:assert/strict';
import { getDownloadFileName } from '../public/download-file-name.mjs';

test('uses the API attachment name for the automatic generated-PDF download', () => {
  const headers = new Headers({
    'Content-Disposition': 'attachment; filename="Protokol_Jan_Kowalski_Wydanie.pdf"'
  });

  assert.equal(
    getDownloadFileName(headers, 'protokol.pdf'),
    'Protokol_Jan_Kowalski_Wydanie.pdf'
  );
});

test('uses the fallback name when the API does not provide an attachment name', () => {
  assert.equal(getDownloadFileName(new Headers(), 'protokol.pdf'), 'protokol.pdf');
});
