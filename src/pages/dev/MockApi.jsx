import { useMemo, useState } from 'react';
import { Braces, Send, Trash2 } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import Button from '../../components/ui/Button';
import CopyButton from '../../components/ui/CopyButton';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { MOCK_ERROR_KEYS, MOCK_STATUS_CODES, MOCK_TTL_HOURS, mockCurlExample, mockDeleteCurlExample, validateMockInput } from '../../utils/mockApiTools';

const SAMPLE_JSON = '{\n  "message": "Hello from FlareTools",\n  "items": [\n    { "id": 1, "name": "Example" }\n  ]\n}';

async function callMockApi(path, options) {
  const response = await fetch(`/api/mock/${path}`, options);
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.code || 'SERVICE_UNAVAILABLE');
  return payload;
}

export default function MockApi() {
  const { lang, t } = useI18n();
  const [input, setInput] = useState(SAMPLE_JSON);
  const [status, setStatus] = useState(200);
  const [ttlHours, setTtlHours] = useState(1);
  const [published, setPublished] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [manualId, setManualId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const validated = useMemo(() => validateMockInput(input, status, ttlHours), [input, status, ttlHours]);

  const showError = (error) => setNotice({ tone: 'error', key: MOCK_ERROR_KEYS[error.message] || 'mock_error_network' });
  const publish = async () => {
    if (validated.error) {
      setNotice({ tone: 'error', key: MOCK_ERROR_KEYS[validated.error] });
      return;
    }
    setBusy('publish');
    setNotice(null);
    try {
      const payload = await callMockApi('create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: input, status, ttl_hours: ttlHours }),
      });
      setPublished(payload);
    } catch (error) {
      showError(error);
    } finally {
      setBusy('');
    }
  };

  const deleteMock = async (id, token, mode) => {
    if (!/^[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) {
      setNotice({ tone: 'error', key: 'mock_error_management' });
      return;
    }
    setBusy(mode);
    setNotice(null);
    try {
      await callMockApi(id, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (published?.id === id) setPublished(null);
      if (mode === 'manual-delete') {
        setManualId('');
        setManualToken('');
      }
      setNotice({ tone: 'success', key: 'mock_deleted' });
    } catch (error) {
      if (error.message === 'NOT_FOUND' && published?.id === id) setPublished(null);
      showError(error);
    } finally {
      setBusy('');
    }
  };

  return (
    <ToolLayout>
      <SEO titleKey="tool_mock_api" descriptionKey="tool_mock_api_desc" />
      <ToolPageHeader eyebrow={t('mock_eyebrow')} icon={Braces} title={t('tool_mock_api')} description={t('tool_mock_api_desc')} />
      <StatusNotice className="mt-6" tone="warning">{t('mock_notice')}</StatusNotice>
      {notice && <StatusNotice className="mt-4" tone={notice.tone}>{t(notice.key)}</StatusNotice>}

      <ToolPanel className="mt-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <label className="tool-label" htmlFor="mock-json">{t('mock_input')}</label>
            <p className="mb-3 text-xs leading-6 text-[var(--muted)]">{t('mock_input_hint')}</p>
            <textarea id="mock-json" value={input} onChange={(event) => setInput(event.target.value)} spellCheck="false" className="tool-control min-h-72 font-mono text-sm" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={Boolean(validated.error)} onClick={() => setInput(validated.preview)}>{t('mock_format')}</Button>
              <Button variant="ghost" onClick={() => setInput(SAMPLE_JSON)}>{t('mock_sample')}</Button>
            </div>
          </section>
          <section>
            <h2 className="tool-label">{t('mock_preview')}</h2>
            <pre className="min-h-72 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4 font-mono text-sm leading-6 text-[var(--text-strong)]">
              {validated.error ? t(MOCK_ERROR_KEYS[validated.error]) : validated.preview}
            </pre>
            {!validated.error && <p className="mt-3 text-xs text-[var(--muted)]">{t('mock_bytes')}: {validated.bytes.toLocaleString(lang)} / 32,768 bytes</p>}
          </section>
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-end">
          <div className="sm:min-w-44">
            <label className="tool-label" htmlFor="mock-status">{t('mock_status')}</label>
            <select id="mock-status" value={status} onChange={(event) => setStatus(Number(event.target.value))} className="tool-control">
              {MOCK_STATUS_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div className="sm:min-w-44">
            <label className="tool-label" htmlFor="mock-expiry">{t('mock_expiry')}</label>
            <select id="mock-expiry" value={ttlHours} onChange={(event) => setTtlHours(Number(event.target.value))} className="tool-control">
              {MOCK_TTL_HOURS.map((hours) => <option key={hours} value={hours}>{t(`mock_expiry_${hours}`)}</option>)}
            </select>
          </div>
          <Button disabled={Boolean(validated.error || busy || published)} loading={busy === 'publish'} onClick={publish}>
            <Send className="size-4" aria-hidden="true" />{t(busy === 'publish' ? 'mock_publishing' : 'mock_publish')}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-6 text-[var(--muted)]">{t(published ? 'mock_one_at_a_time' : 'mock_fixed_expiry')}</p>
      </ToolPanel>

      {published && (
        <ToolPanel className="mt-5" title={t('mock_published')}>
          <label className="tool-label" htmlFor="mock-url">{t('mock_url')}</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input id="mock-url" readOnly value={published.url} className="tool-control flex-1 font-mono text-sm" />
            <CopyButton value={published.url} label={t('mock_copy_url')} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--muted)]">
            <p>{t('mock_response_status')}: <span className="font-mono">{published.status}</span></p>
            <p>{t('mock_expires_at')}: <time dateTime={new Date(published.expires_at * 1000).toISOString()}>{new Date(published.expires_at * 1000).toLocaleString(lang)}</time></p>
          </div>
          <h3 className="tool-label mt-5">{t('mock_curl')}</h3>
          <pre className="overflow-auto rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4 font-mono text-xs leading-6">{mockCurlExample(published.url)}</pre>
          <CopyButton className="mt-3" value={mockCurlExample(published.url)} label={t('mock_copy_curl')} />
          <div className="mt-5 border-t border-[var(--line)] pt-5">
            <StatusNotice tone="warning">{t('mock_token_notice')}</StatusNotice>
            <label className="tool-label mt-4" htmlFor="mock-management-token">{t('mock_token')}</label>
            <input id="mock-management-token" readOnly type="password" value={published.management_token} autoComplete="off" className="tool-control font-mono text-sm" />
            <div className="mt-3 flex flex-wrap gap-3">
              <CopyButton value={published.management_token} label={t('mock_copy_token')} />
              <Button variant="danger" disabled={Boolean(busy)} loading={busy === 'delete'} onClick={() => deleteMock(published.id, published.management_token, 'delete')}>
                <Trash2 className="size-4" aria-hidden="true" />{t('mock_delete')}
              </Button>
            </div>
            <details className="mt-4 text-sm text-[var(--muted)]">
              <summary className="min-h-11 cursor-pointer py-2">{t('mock_delete_curl')}</summary>
              <pre className="overflow-auto rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4 font-mono text-xs leading-6">{mockDeleteCurlExample(published.url, published.management_token)}</pre>
              <CopyButton className="mt-3" value={mockDeleteCurlExample(published.url, published.management_token)} label={t('mock_copy_delete_curl')} />
            </details>
          </div>
        </ToolPanel>
      )}

      <ToolPanel className="mt-5" title={t('mock_manage')} description={t('mock_manage_hint')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="tool-label" htmlFor="mock-manual-id">{t('mock_id')}</label>
            <input id="mock-manual-id" value={manualId} onChange={(event) => setManualId(event.target.value.trim())} placeholder={t('mock_id_placeholder')} maxLength={32} autoComplete="off" spellCheck="false" className="tool-control font-mono text-sm" />
          </div>
          <div>
            <label className="tool-label" htmlFor="mock-manual-token">{t('mock_manage_token')}</label>
            <input id="mock-manual-token" type="password" value={manualToken} onChange={(event) => setManualToken(event.target.value.trim())} placeholder={t('mock_token_placeholder')} maxLength={64} autoComplete="off" className="tool-control font-mono text-sm" />
          </div>
        </div>
        <Button className="mt-4" variant="danger" disabled={Boolean(busy || !manualId || !manualToken)} loading={busy === 'manual-delete'} onClick={() => deleteMock(manualId, manualToken, 'manual-delete')}>
          <Trash2 className="size-4" aria-hidden="true" />{t('mock_delete')}
        </Button>
      </ToolPanel>
    </ToolLayout>
  );
}
