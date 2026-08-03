const DEFAULT_LIBREOFFICE_TIMEOUT_MS = 120_000;

const getLibreOfficeTimeoutMs = () => {
  const configuredTimeout = Number(process.env.LIBREOFFICE_TIMEOUT_MS);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_LIBREOFFICE_TIMEOUT_MS;
};

module.exports = { getLibreOfficeTimeoutMs };
