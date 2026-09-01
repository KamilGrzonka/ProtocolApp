const fs = require('node:fs/promises');
const path = require('node:path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { HttpError } = require('./http-error.cjs');

const protocolTemplates = Object.freeze({
  wydanie: Object.freeze({
    type: 'wydanie',
    fileName: 'szablon_wydanie.docx'
  }),
  aterima_medusmo_wydanie: Object.freeze({
    type: 'wydanie',
    fileName: 'aterima_medusmo_szablon_wydanie.docx'
  }),
  aterima_nezeen_wydanie: Object.freeze({
    type: 'wydanie',
    fileName: 'aterima_nezeen_szablon_wydanie.docx'
  }),
  zdanie: Object.freeze({
    type: 'zdanie',
    fileName: 'szablon_zdanie.docx'
  }),
  medusmo_zdanie: Object.freeze({
    type: 'zdanie',
    fileName: 'medusmo_szablon_zdanie.docx'
  })
});

const templateFileNames = Object.freeze(Object.fromEntries(
  Object.entries(protocolTemplates).map(([selection, template]) => [selection, template.fileName])
));

const requiredFields = Object.freeze([
  'ImieNazwisko',
  'PESEL',
  'Data',
  'ModelKomputera',
  'NumerSerwisowy',
  'Ladowarka',
  'Monitor',
  'Klawiatura',
  'Mysz',
  'Sluchawki',
  'Wartosc',
  'Uwagi'
]);

const validateProtocolRequest = (body) => {
  const { typProtokolu: wariantProtokolu, ...protocolData } = body || {};

  if (!Object.prototype.hasOwnProperty.call(protocolTemplates, wariantProtokolu)) {
    throw new HttpError(400, 'Nieprawidłowy typ protokołu.');
  }

  const template = protocolTemplates[wariantProtokolu];

  const missingFields = requiredFields.filter((field) => typeof protocolData[field] !== 'string');

  if (missingFields.length > 0) {
    throw new HttpError(400, `Brak wymaganych pól: ${missingFields.join(', ')}.`);
  }

  return {
    typProtokolu: template.type,
    wariantProtokolu,
    templateFileName: template.fileName,
    protocolData
  };
};

const renderProtocolDocx = async ({ templateFileName, protocolData, templateDirectory }) => {
  const templateBuffer = await fs.readFile(path.join(templateDirectory, templateFileName));
  const zip = new PizZip(templateBuffer);
  const document = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true
  });

  document.render(protocolData);

  return document.getZip().generate({
    type: 'nodebuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
};

module.exports = {
  protocolTemplates,
  renderProtocolDocx,
  requiredFields,
  templateFileNames,
  validateProtocolRequest
};
