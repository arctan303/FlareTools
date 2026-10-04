import { useMemo, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { analyzeString, decodeString } from '../../utils/stringProcessor';

const RESULT_FIELDS = [
  { key: 'md5', label: 'MD5' },
  { key: 'sha1', label: 'SHA-1' },
  { key: 'sha256', label: 'SHA-256' },
  { key: 'base64', label: 'Base64' },
  { key: 'url', labelKey: 'tool_string_url_encoded' },
];

function ResultCard({ title, value }) {
  return (
    <article className="flex min-w-0 flex-col rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
        <CopyButton value={value} />
      </div>
    <output className="min-h-20 whitespace-pre-wrap break-all rounded-[8px] border border-[var(--line)] bg-[var(--page-soft)] p-3 font-mono text-xs leading-6 text-[var(--muted)]">
        {value || '—'}
      </output>
    </article>
  );
}

export default function StringProcessor() {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('encode');
  const analysis = useMemo(() => analyzeString(input), [input]);
  const decoded = useMemo(() => mode === 'encode' ? null : decodeString(input, mode), [input, mode]);
  const resultFields = mode === 'encode' ? RESULT_FIELDS : RESULT_FIELDS.filter(({ key }) => ['md5', 'sha1', 'sha256'].includes(key));
  const statItems = [
    [t('tool_counter_characters'), analysis.stats.chars],
    [t('tool_counter_words'), analysis.stats.words],
    [t('tool_counter_lines'), analysis.stats.lines],
    [t('tool_counter_bytes'), analysis.stats.bytes],
  ];

  return (
    <ToolLayout>
      <SEO titleKey="tool_string_processor" descriptionKey="tool_string_processor_desc" />
      <ToolPageHeader
        eyebrow={t('local_tool_eyebrow')}
        icon={Fingerprint}
        title={t('tool_string_processor')}
        description={t('tool_string_processor_desc')}
      />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5" title={t('tool_string_input_title')} description={t('tool_string_input_desc')}>
        <label className="tool-label" htmlFor="string-mode">{t('local_string_mode')}</label>
        <select id="string-mode" value={mode} onChange={(event) => setMode(event.target.value)} className="tool-control mb-4 sm:max-w-xs">
          <option value="encode">{t('local_string_encode')}</option>
          <option value="base64">{t('local_string_base64_decode')}</option>
          <option value="url">{t('local_string_url_decode')}</option>
        </select>
        <label className="sr-only" htmlFor="string-input">{t('tool_string_input_title')}</label>
        <textarea
          id="string-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('tool_encoder_input_ph')}
          className="tool-control min-h-44 font-mono text-sm"
        />
        {analysis.error && (
          <StatusNotice className="mt-4" tone="error">{t('tool_string_process_failed')}</StatusNotice>
        )}
        {decoded?.error && (
          <StatusNotice className="mt-4" tone="error">{t(`local_string_${decoded.error.replaceAll('-', '_')}`)}</StatusNotice>
        )}
        {mode !== 'encode' && <p className="mt-3 text-xs text-[var(--muted)]">{t('local_string_input_stats')}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statItems.map(([label, value]) => (
            <div key={label} className="rounded-[8px] border border-[var(--line)] bg-[var(--page-soft)] px-3 py-3">
              <dt className="text-xs text-[var(--muted)]">{label}</dt>
              <dd className="mt-1 font-mono text-lg font-semibold text-[var(--text-strong)]">{value}</dd>
            </div>
          ))}
        </dl>
      </ToolPanel>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t('tool_string_results')}>
        {decoded && <ResultCard title={t('local_string_decoded')} value={decoded.value} />}
        {resultFields.map(({ key, label, labelKey }) => (
          <ResultCard key={key} title={labelKey ? t(labelKey) : label} value={analysis.results[key]} />
        ))}
      </section>
    </ToolLayout>
  );
}
