export function timestampToDate(value) {
  if (!String(value).trim()) return { error: null, value: null };
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return { error: 'invalid-timestamp', value: null };
  const date = new Date(Math.abs(numericValue) > 9999999999 ? numericValue : numericValue * 1000);
  if (Number.isNaN(date.getTime())) return { error: 'invalid-timestamp', value: null };
  return { error: null, value: date };
}

export function dateToTimestamp(value) {
  if (!String(value).trim()) return { error: null, value: '' };
  const milliseconds = new Date(value).getTime();
  if (Number.isNaN(milliseconds)) return { error: 'invalid-date', value: '' };
  return { error: null, value: String(Math.floor(milliseconds / 1000)) };
}
