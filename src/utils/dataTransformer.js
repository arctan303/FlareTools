import TOML from '@iarna/toml';
import Papa from 'papaparse';
import beautify from 'js-beautify';
import { format as sqlFormat } from 'sql-formatter';
import YAML from 'yaml';

export const CODE_FORMATS = ['javascript', 'html', 'css', 'sql'];
export const STRUCTURED_FORMATS = ['json', 'yaml', 'csv', 'toml'];
const { css: beautifyCSS, html: beautifyHTML, js: beautifyJS } = beautify;

export function transformData({ indentSize = 2, input, inputType, outputType }) {
  if (!input.trim()) return { error: null, output: '', status: 'empty' };

  try {
    if (CODE_FORMATS.includes(inputType)) {
      if (inputType !== outputType) {
        return { error: 'unsupported-conversion', output: '', status: 'error' };
      }
      const formatters = {
        javascript: () => beautifyJS(input, { indent_size: indentSize }),
        html: () => beautifyHTML(input, { indent_size: indentSize }),
        css: () => beautifyCSS(input, { indent_size: indentSize }),
        sql: () => sqlFormat(input, { tabWidth: indentSize }),
      };
      return { error: null, output: formatters[inputType](), status: 'success' };
    }

    let parsedData;
    if (inputType === 'json') parsedData = JSON.parse(input);
    else if (inputType === 'yaml') parsedData = YAML.parse(input);
    else if (inputType === 'csv') {
      const csvResult = Papa.parse(input, { header: true, skipEmptyLines: true });
      if (csvResult.errors.length > 0) throw new Error(csvResult.errors[0].message);
      parsedData = csvResult.data;
    } else if (inputType === 'toml') parsedData = TOML.parse(input);
    else return { error: 'unsupported-input', output: '', status: 'error' };

    let output;
    if (outputType === 'json') output = JSON.stringify(parsedData, null, Number(indentSize));
    else if (outputType === 'yaml') output = YAML.stringify(parsedData);
    else if (outputType === 'csv') output = Papa.unparse(parsedData);
    else if (outputType === 'toml') output = TOML.stringify(parsedData);
    else return { error: 'unsupported-conversion', output: '', status: 'error' };

    return { error: null, output, status: 'success' };
  } catch (error) {
    return { error: error.message || 'invalid-input', output: '', status: 'error' };
  }
}
