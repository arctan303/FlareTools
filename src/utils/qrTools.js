export const QR_MAX_UTF8_BYTES = 2300;

export function validateQrContent(value) {
  const text = String(value ?? '');
  const bytes = new TextEncoder().encode(text).length;

  if (!text) return { bytes, status: 'empty' };
  if (bytes > QR_MAX_UTF8_BYTES) return { bytes, status: 'too-long' };
  return { bytes, status: 'valid' };
}
