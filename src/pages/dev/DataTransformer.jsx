import { useMemo, useState } from 'react';
import { ArrowRightLeft, Database } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { CODE_FORMATS, transformData } from '../../utils/dataTransformer';

const DATA_FORMATS = ['json', 'yaml', 'csv', 'toml'];

export default function DataTransformer() {
  const { t } = useI18n();
  const [indentSize, setIndentSize] = useState(2);
  const [input, setInput] = useState('');
  const [inputType, setInputType] = useState('json');
  const [outputType, setOutputType] = useState('json');
  const result = useMemo(() => transformData({ indentSize, input, inputType, outputType }), [indentSize, input, inputType, outputType]);

  const selectInputType = (nextType) => {
    setInputType(nextType);
    if (CODE_FORMATS.includes(nextType)) setOutputType(nextType);
    else if (CODE_FORMATS.includes(outputType)) setOutputType('json');
  };

  const errorDetail = result.error === 'unsupported-conversion' || result.error === 'unsupported-input'
    ? t('tool_converter_unsupported')
    : result.error;

  return (
    <ToolLayout>
      <SEO titleKey="tool_data_transformer" descriptionKey="tool_data_transformer_desc" />
      <ToolPageHeader
        eyebrow={t('local_tool_eyebrow')}
        icon={Database}
        title={t('tool_data_transformer')}
        description={t('tool_data_transformer_desc')}
      />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5 !p-0 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--line)] bg-[var(--page-soft)] p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="tool-label" htmlFor="transform-input-type">{t('label_input')}</label>
              <select
                id="transform-input-type"
                value={inputType}
                onChange={(event) => selectInputType(event.target.value)}
                className="tool-control min-w-40"
              >
                <optgroup label={t('tool_format_data_group')}>
                  {DATA_FORMATS.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
                </optgroup>
                <optgroup label={t('tool_format_code_group')}>
                  {CODE_FORMATS.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
                </optgroup>
              </select>
            </div>
            <ArrowRightLeft className="mb-3 hidden size-4 text-[var(--faint)] sm:block" aria-hidden="true" />
            <div>
              <label className="tool-label" htmlFor="transform-output-type">{t('label_output')}</label>
              <select
                id="transform-output-type"
                value={outputType}
                onChange={(event) => setOutputType(event.target.value)}
                className="tool-control min-w-40"
              >
                {CODE_FORMATS.includes(inputType)
                  ? <option value={inputType}>{inputType.toUpperCase()}</option>
                  : DATA_FORMATS.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {['json', ...CODE_FORMATS].includes(outputType) && (
              <div>
                <label className="tool-label" htmlFor="transform-indent">{t('tool_indent_size')}</label>
                <select
                  id="transform-indent"
                  value={indentSize}
                  onChange={(event) => setIndentSize(Number(event.target.value))}
                  className="tool-control"
                >
                  <option value={2}>{t('tool_formatter_2spaces')}</option>
                  <option value={4}>{t('tool_formatter_4spaces')}</option>
                  <option value={8}>{t('tool_formatter_8spaces')}</option>
                </select>
              </div>
            )}
            <CopyButton value={result.output} />
          </div>
        </div>

        {result.status === 'error' && (
          <StatusNotice className="m-4 mb-0" tone="error" title={t('tool_converter_err')}>
            <span className="break-words font-mono text-xs">{errorDetail}</span>
          </StatusNotice>
        )}

        <div className="grid min-h-[620px] md:grid-cols-2 md:divide-x md:divide-[var(--line)]">
          <div className="flex min-h-[300px] flex-col border-b border-[var(--line)] md:border-b-0">
            <label className="border-b border-[var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]" htmlFor="transform-input">
              {t('tool_converter_input')}
            </label>
            <textarea
              id="transform-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('tool_converter_paste_ph')}
              spellCheck="false"
              className="min-h-[260px] flex-1 resize-none bg-[var(--surface)] p-4 font-mono text-sm leading-7 text-[var(--text-strong)]"
            />
          </div>
          <div className="flex min-h-[300px] flex-col bg-[var(--page-soft)]">
            <label className="border-b border-[var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]" htmlFor="transform-output">
              {t('tool_converter_output')}
            </label>
            <textarea
              id="transform-output"
              readOnly
              value={result.output}
              placeholder={t('tool_converter_result_ph')}
              spellCheck="false"
              className="min-h-[260px] flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-7 text-[var(--text-strong)]"
            />
          </div>
        </div>
      </ToolPanel>
    </ToolLayout>
  );
}
