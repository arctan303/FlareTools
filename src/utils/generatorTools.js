const CHARACTER_GROUPS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+~`|}{[]:;?><,./-=',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
};

export function generatePassword(options, fillRandom = (values) => crypto.getRandomValues(values)) {
  const groups = Object.entries(CHARACTER_GROUPS)
    .filter(([key]) => options[key])
    .map(([, characters]) => characters);
  const pool = groups.join('');
  if (!pool) return { error: 'no-character-types', value: '' };

  const length = Math.min(64, Math.max(4, Number(options.length) || 16));
  const randomValues = new Uint32Array(length);
  fillRandom(randomValues);
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += pool[randomValues[index] % pool.length];
  }
  return { error: null, value };
}
