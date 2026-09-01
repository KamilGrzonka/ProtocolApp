const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { HttpError } = require('../server/http-error.cjs');
const {
  protocolTemplates,
  renderProtocolDocx,
  validateProtocolRequest
} = require('../server/protocol-template.cjs');

const validProtocolData = Object.freeze({
  ImieNazwisko: 'Jan Kowalski',
  PESEL: '90010112345',
  Data: '2026-09-01',
  ModelKomputera: 'ThinkPad T14',
  NumerSerwisowy: 'SER-123',
  Ladowarka: 'Tak',
  Monitor: 'Nie',
  Klawiatura: 'Nie',
  Mysz: 'Nie',
  Sluchawki: 'Nie',
  Wartosc: '1000 PLN',
  Uwagi: 'Brak'
});

const protocolCases = Object.freeze([
  Object.freeze({
    selection: 'wydanie',
    type: 'wydanie',
    fileName: 'szablon_wydanie.docx',
    label: 'Wydanie – Nezeen / LeasingTeam Professional'
  }),
  Object.freeze({
    selection: 'aterima_medusmo_wydanie',
    type: 'wydanie',
    fileName: 'aterima_medusmo_szablon_wydanie.docx',
    label: 'Wydanie – Medusmo / ATERIMA Europe'
  }),
  Object.freeze({
    selection: 'aterima_nezeen_wydanie',
    type: 'wydanie',
    fileName: 'aterima_nezeen_szablon_wydanie.docx',
    label: 'Wydanie – Nezeen / ATERIMA Europe'
  }),
  Object.freeze({
    selection: 'zdanie',
    type: 'zdanie',
    fileName: 'szablon_zdanie.docx',
    label: 'Zdanie – Nezeen'
  }),
  Object.freeze({
    selection: 'medusmo_zdanie',
    type: 'zdanie',
    fileName: 'medusmo_szablon_zdanie.docx',
    label: 'Zdanie – Medusmo'
  })
]);

test('resolves every supported protocol selection to its template and archive type', () => {
  assert.equal(Object.keys(protocolTemplates).length, protocolCases.length);

  for (const { selection, type, fileName } of protocolCases) {
    const result = validateProtocolRequest({
      typProtokolu: selection,
      ...validProtocolData
    });

    assert.equal(result.wariantProtokolu, selection);
    assert.equal(result.typProtokolu, type);
    assert.equal(result.templateFileName, fileName);
  }
});

test('renders every supported DOCX template with all protocol fields', async () => {
  for (const [selection, template] of Object.entries(protocolTemplates)) {
    const result = await renderProtocolDocx({
      templateFileName: template.fileName,
      protocolData: validProtocolData,
      templateDirectory: path.resolve(__dirname, '..')
    });
    const documentXml = new PizZip(result).file('word/document.xml').asText();

    for (const [field, value] of Object.entries(validProtocolData)) {
      assert.ok(documentXml.includes(value), `${selection} nie wypełnia pola ${field}`);
    }
  }
});

test('exposes every supported template in the form and Netlify bundle', async () => {
  const projectDirectory = path.resolve(__dirname, '..');
  const [indexHtml, netlifyConfig] = await Promise.all([
    fs.readFile(path.join(projectDirectory, 'public', 'index.html'), 'utf8'),
    fs.readFile(path.join(projectDirectory, 'netlify.toml'), 'utf8')
  ]);

  assert.ok(indexHtml.includes('<optgroup label="Wydanie">'));
  assert.ok(indexHtml.includes('<optgroup label="Zdanie">'));

  for (const { selection, fileName, label } of protocolCases) {
    assert.ok(
      indexHtml.includes(`<option value="${selection}">${label}</option>`),
      `${selection} nie ma poprawnej etykiety w formularzu`
    );
    assert.ok(netlifyConfig.includes(`"${fileName}"`), `${fileName} nie trafi do funkcji Netlify`);
  }
});

test('rejects an unsupported protocol type', () => {
  assert.throws(
    () => validateProtocolRequest({ typProtokolu: 'inne' }),
    new HttpError(400, 'Nieprawidłowy typ protokołu.')
  );
});
