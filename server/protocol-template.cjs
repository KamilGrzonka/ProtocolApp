const fs = require('node:fs/promises');
const path = require('node:path');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const { HttpError } = require('./http-error.cjs');

const templateFileNames = Object.freeze({
  wydanie: 'szablon_wydanie.docx',
  zdanie: 'szablon_zdanie.docx'
});

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
  const { typProtokolu, ...protocolData } = body || {};

  if (!Object.prototype.hasOwnProperty.call(templateFileNames, typProtokolu)) {
    throw new HttpError(400, 'Nieprawidłowy typ protokołu.');
  }

  const missingFields = requiredFields.filter((field) => typeof protocolData[field] !== 'string');

  if (missingFields.length > 0) {
    throw new HttpError(400, `Brak wymaganych pól: ${missingFields.join(', ')}.`);
  }

  return { typProtokolu, protocolData };
};

const renderProtocolDocx = async ({ typProtokolu, protocolData, templateDirectory }) => {
  const templateFileName = templateFileNames[typProtokolu];
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
  renderProtocolDocx,
  requiredFields,
  templateFileNames,
  validateProtocolRequest
};
