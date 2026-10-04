export function timestampToDate(value, unit = 'auto') {
  if (!String(value ?? '').trim()) return { error: null, value: null };
  if (!['auto', 'seconds', 'milliseconds'].includes(unit)) return { error: 'invalid-unit', value: null };
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return { error: 'invalid-timestamp', value: null };
  const milliseconds = unit === 'milliseconds' || (unit === 'auto' && Math.abs(numericValue) > 9999999999)
    ? numericValue : numericValue * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return { error: 'invalid-timestamp', value: null };
  return { error: null, value: date };
}

export function dateToTimestamp(value, unit = 'seconds') {
  const text = String(value ?? '').trim();
  if (!text) return { error: null, value: '' };
  if (!['seconds', 'milliseconds'].includes(unit)) return { error: 'invalid-unit', value: '' };
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(text);
  if (dateParts) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = dateParts;
    const calendarCheck = new Date(0);
    calendarCheck.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    // Browsers can normalize February 30 and other invalid ISO calendar dates.
    if (calendarCheck.getUTCMonth() !== Number(month) - 1 || calendarCheck.getUTCDate() !== Number(day)
      || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
      return { error: 'invalid-date', value: '' };
    }
  }
  const milliseconds = new Date(text).getTime();
  if (Number.isNaN(milliseconds)) return { error: 'invalid-date', value: '' };
  return { error: null, value: String(unit === 'milliseconds' ? milliseconds : Math.floor(milliseconds / 1000)) };
}
