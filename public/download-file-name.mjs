export const getDownloadFileName = (headers, fallbackFileName) => {
  const contentDisposition = headers.get('content-disposition') || '';
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);

  return match?.[1]?.trim() || fallbackFileName;
};
