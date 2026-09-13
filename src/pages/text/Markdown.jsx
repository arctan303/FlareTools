import { useMemo, useState } from 'react';
import { FileCode2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';

export default function Markdown() {
  const { t } = useI18n();
  const [markdown, setMarkdown] = useState('');
  const cleanMarkup = useMemo(() => DOMPurify.sanitize(marked(markdown)), [markdown]);

  return (
    <ToolLayout>
      <SEO titleKey="tool_markdown_preview" descriptionKey="tool_markdown_preview_desc" />
      <ToolPageHeader eyebrow={t('local_tool_eyebrow')} icon={FileCode2} title={t('tool_markdown_preview')} description={t('tool_markdown_preview_desc')} />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5 !p-0 overflow-hidden">
        <div className="grid min-h-[620px] lg:grid-cols-2 lg:divide-x lg:divide-[var(--line)]">
          <section className="flex min-h-[310px] flex-col border-b border-[var(--line)] lg:border-b-0">
            <h2 className="border-b border-[var(--line)] bg-[var(--page-soft)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {t('tool_markdown_label')}
            </h2>
            <label className="sr-only" htmlFor="markdown-input">{t('tool_markdown_label')}</label>
            <textarea
              id="markdown-input"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder={t('tool_markdown_input_placeholder')}
              spellCheck="false"
              className="min-h-[280px] flex-1 resize-none bg-[var(--surface)] p-5 font-mono text-sm leading-7 text-[var(--text-strong)]"
            />
          </section>

          <section className="flex min-h-[310px] flex-col bg-[var(--page-soft)]">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{t('tool_markdown_preview_label')}</h2>
              <CopyButton value={cleanMarkup} label={t('tool_markdown_copy_html')} />
            </div>
            {markdown ? (
              <article
                className="prose max-w-none flex-1 overflow-auto p-5 text-[var(--text)] dark:prose-invert prose-headings:font-brand prose-headings:text-[var(--text-strong)] prose-a:text-[var(--accent)] prose-code:font-mono"
                dangerouslySetInnerHTML={{ __html: cleanMarkup }}
              />
            ) : (
              <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--faint)]">{t('tool_markdown_empty')}</p>
            )}
          </section>
        </div>
      </ToolPanel>
    </ToolLayout>
  );
}
