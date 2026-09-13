import convert from 'color-convert';

export function fromHex(value) {
  const clean = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) return { error: 'invalid-hex' };
  const rgb = convert.hex.rgb(clean);
  const hsl = convert.hex.hsl(clean);
  return {
    error: null,
    hex: `#${clean.toLowerCase()}`,
    hsl: `${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%`,
    rgb: rgb.join(', '),
  };
}

export function fromRgb(value) {
  const channels = value.split(',').map((part) => Number(part.trim()));
  if (channels.length !== 3 || channels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return { error: 'invalid-rgb' };
  }
  const hsl = convert.rgb.hsl(channels);
  return {
    error: null,
    hex: `#${convert.rgb.hex(channels).toLowerCase()}`,
    hsl: `${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%`,
    rgb: channels.join(', '),
  };
}

export function fromHsl(value) {
  const channels = value.replace(/%/g, '').split(/[, ]+/).filter(Boolean).map(Number);
  if (
    channels.length !== 3
    || channels.some((channel) => !Number.isFinite(channel))
    || channels[0] < 0 || channels[0] > 360
    || channels[1] < 0 || channels[1] > 100
    || channels[2] < 0 || channels[2] > 100
  ) return { error: 'invalid-hsl' };

  return {
    error: null,
    hex: `#${convert.hsl.hex(channels).toLowerCase()}`,
    hsl: `${channels[0]}, ${channels[1]}%, ${channels[2]}%`,
    rgb: convert.hsl.rgb(channels).join(', '),
  };
}
