import { useDeferredValue, useMemo, useState } from 'react';
import { GitCompare } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { compareText } from '../../utils/diffTools';

export default function Diff() {
  const { t } = useI18n();
  const [modified, setModified] = useState('');
  const [original, setOriginal] = useState('');
  const [mode, setMode] = useState('lines');
  const deferredOriginal = useDeferredValue(original);
  const deferredModified = useDeferredValue(modified);
  const result = useMemo(() => compareText(deferredOriginal, deferredModified, mode), [deferredModified, deferredOriginal, mode]);
  const isUpdating = deferredOriginal !== original || deferredModified !== modified;
  const diffResult = result.parts;

  return (
    <ToolLayout>
      <SEO titleKey="tool_text_diff" descriptionKey="tool_text_diff_desc" />
      <ToolPageHeader eyebrow={t('local_tool_eyebrow')} icon={GitCompare} title={t('tool_text_diff')} description={t('tool_text_diff_desc')} />
      <LocalToolNotice className="mt-6" />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ToolPanel title={t('tool_diff_original')}>
          <label className="sr-only" htmlFor="diff-original">{t('tool_diff_original')}</label>
          <textarea
            id="diff-original"
            value={original}
            onChange={(event) => setOriginal(event.target.value)}
            className="tool-control min-h-56 font-mono text-sm"
            placeholder={t('tool_diff_original_placeholder')}
            spellCheck="false"
          />
        </ToolPanel>
        <ToolPanel title={t('tool_diff_modified')}>
          <label className="sr-only" htmlFor="diff-modified">{t('tool_diff_modified')}</label>
          <textarea
            id="diff-modified"
            value={modified}
            onChange={(event) => setModified(event.target.value)}
            className="tool-control min-h-56 font-mono text-sm"
            placeholder={t('tool_diff_modified_placeholder')}
            spellCheck="false"
          />
        </ToolPanel>
      </div>

      <ToolPanel className="mt-5" title={t('tool_diff_output')}>
        <label className="tool-label" htmlFor="diff-mode">{t('local_diff_mode')}</label>
        <select id="diff-mode" value={mode} onChange={(event) => setMode(event.target.value)} className="tool-control mb-4 sm:max-w-xs">
          <option value="lines">{t('local_diff_lines')}</option>
          <option value="words">{t('local_diff_words')}</option>
          <option value="chars">{t('local_diff_chars')}</option>
        </select>
        <div className="mb-4 flex flex-wrap gap-4 text-xs text-[var(--muted)]" aria-label={t('tool_diff_legend')}>
          <span className="inline-flex items-center gap-2"><span className="font-mono font-semibold text-[var(--success)]">+</span>{t('tool_diff_added')}</span>
          <span className="inline-flex items-center gap-2"><span className="font-mono font-semibold text-[var(--danger)]">−</span>{t('tool_diff_removed')}</span>
        </div>
        {result.error ? (
          <StatusNotice tone="error">{t(result.error === 'too-large' ? 'local_diff_too_large' : 'local_diff_too_complex')}</StatusNotice>
        ) : diffResult.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--page-soft)] px-4 py-12 text-center text-sm text-[var(--faint)]">{t('tool_diff_empty')}</p>
        ) : (
          <div className={`max-h-[440px] overflow-auto rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4 font-mono text-sm leading-7 whitespace-pre-wrap ${isUpdating ? 'opacity-60' : ''}`} aria-live="polite" aria-busy={isUpdating}>
            {diffResult.map((part, index) => {
              const type = part.added ? 'added' : part.removed ? 'removed' : 'unchanged';
              const className = part.added
                ? 'bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--text-strong)]'
                : part.removed
                  ? 'bg-[color-mix(in_srgb,var(--danger)_13%,transparent)] text-[var(--muted)] line-through'
                  : 'text-[var(--muted)]';
              return (
                <span key={`${index}-${type}`} className={`${className} rounded-[4px] ${mode === 'lines' ? 'block px-1' : ''}`}>
                  {type !== 'unchanged' && (
                    <>
                      <span className="sr-only">{t(type === 'added' ? 'tool_diff_added' : 'tool_diff_removed')}: </span>
                      {mode === 'lines' && <span aria-hidden="true" className="mr-2 inline-flex min-w-16 items-center gap-1 font-sans text-xs font-semibold no-underline">
                        <span className="font-mono">{type === 'added' ? '+' : '−'}</span>
                        {t(type === 'added' ? 'tool_diff_added' : 'tool_diff_removed')}
                      </span>}
                    </>
                  )}
                  {part.value}
                </span>
              );
            })}
          </div>
        )}
      </ToolPanel>
    </ToolLayout>
  );
}
