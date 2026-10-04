import { diffChars, diffLines, diffWordsWithSpace } from 'diff';

export const DIFF_MAX_CHARACTERS = 100000;
const DIFF_METHODS = { lines: diffLines, words: diffWordsWithSpace, chars: diffChars };

export function compareText(original, modified, mode = 'lines') {
  if (!original && !modified) return { error: null, parts: [] };
  if (original.length + modified.length > DIFF_MAX_CHARACTERS) {
    return { error: 'too-large', parts: [] };
  }
  const method = DIFF_METHODS[mode];
  if (!method) return { error: 'invalid-mode', parts: [] };
  const parts = method(original, modified, { timeout: 150, maxEditLength: 2000 });
  return parts ? { error: null, parts } : { error: 'too-complex', parts: [] };
}
