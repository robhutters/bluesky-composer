// Roughly estimate byte size of a base64 data URL payload.
export const dataUrlSizeBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
};
