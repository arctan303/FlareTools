import { useEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import Button from '../../components/ui/Button';
import CopyButton from '../../components/ui/CopyButton';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { DEFAULT_ALLOWED_HOSTS, DNS_RECORD_TYPES, dnsTypeLabel, normalizeDnsName, normalizeHttpTarget } from '../../utils/networkTools';

function useNetworkTask() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);

  async function run(query, options = {}) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError('');
    setResult(null);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/network?${query}`, { ...options, signal: controller.signal, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.code || 'NETWORK_FAILED');
      if (active.current === controller) setResult(payload);
    } catch (failure) {
      if (active.current === controller) setError(controller.signal.aborted ? 'NETWORK_TIMEOUT' : failure.message);
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }

  return { result, error, loading, run, setError };
}

function NetworkErrorNotice({ code }) {
  const { t } = useI18n();
  if (!code) return null;
  const key = `network_error_${code}`;
  return <StatusNotice className="mt-4" tone="error">{t(key) === key ? t('network_error_NETWORK_FAILED') : t(key)}</StatusNotice>;
}

export default function NetworkInspector() {
  const { t } = useI18n();
  const identityTask = useNetworkTask();
  const dnsTask = useNetworkTask();
  const httpTask = useNetworkTask();
  const [domain, setDomain] = useState('example.com');
  const [recordType, setRecordType] = useState('A');
  const [target, setTarget] = useState('https://example.com');
  const allowedHosts = identityTask.result?.allowedHosts || DEFAULT_ALLOWED_HOSTS;
  const identity = identityTask.result?.identity;
  const dns = dnsTask.result?.dns;

  function lookup(event) {
    event.preventDefault();
    try {
      const name = normalizeDnsName(domain);
      dnsTask.run(new URLSearchParams({ action: 'dns', name, type: recordType }));
    } catch (failure) { dnsTask.setError(failure.code); }
  }

  function inspect(event) {
    event.preventDefault();
    try {
      const url = normalizeHttpTarget(target);
      httpTask.run('action=http', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.href }) });
    } catch (failure) { httpTask.setError(failure.code); }
  }

  return (
    <ToolLayout>
      <SEO titleKey="tool_network_inspector" descriptionKey="tool_network_inspector_desc" />
      <ToolPageHeader eyebrow={t('network_eyebrow')} icon={Globe} title={t('tool_network_inspector')} description={t('tool_network_inspector_desc')} />
      <StatusNotice className="mt-6">{t('network_notice')}</StatusNotice>

      <ToolPanel className="mt-5" title={t('network_identity_title')} description={t('network_identity_desc')}>
        <Button loading={identityTask.loading} onClick={() => identityTask.run('action=identity')}>
          {t(identity ? 'network_refresh_identity' : 'network_load_identity')}
        </Button>
        <NetworkErrorNotice code={identityTask.error} />
        {identity && (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {['ip', 'asn', 'organization', 'country', 'colo'].map((field) => (
              <div key={field} className="rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-3">
                <dt className="text-sm text-[var(--muted)]">{t(`network_${field}`)}</dt>
                <dd className="mt-1 flex items-center justify-between gap-2 break-all font-mono text-sm text-[var(--text-strong)]">
                  {identity[field] ?? t('network_unavailable')}
                  {field === 'ip' && identity.ip && <CopyButton value={identity.ip} />}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </ToolPanel>

      <ToolPanel className="mt-5" title={t('network_dns_title')} description={t('network_dns_desc')}>
        <form onSubmit={lookup} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-end">
          <div>
            <label className="tool-label" htmlFor="network-domain">{t('network_domain')}</label>
            <input id="network-domain" className="tool-control font-mono" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={253} />
          </div>
          <div>
            <label className="tool-label" htmlFor="network-record-type">{t('network_record_type')}</label>
            <select id="network-record-type" className="tool-control" value={recordType} onChange={(event) => setRecordType(event.target.value)}>
              {Object.keys(DNS_RECORD_TYPES).map((type) => <option key={type}>{type}</option>)}
            </select>
          </div>
          <Button type="submit" loading={dnsTask.loading}>{t('network_lookup')}</Button>
        </form>
        <NetworkErrorNotice code={dnsTask.error} />
        {dns && (
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
              <p>{t('network_dns_status')}: {dns.status} · {t('network_dnssec')}: {t(dns.dnssec ? 'network_dnssec_yes' : 'network_dnssec_no')}</p>
              <CopyButton value={JSON.stringify(dns, null, 2)} />
            </div>
            {dns.answers.length === 0 ? <StatusNotice className="mt-3">{t('network_dns_empty')}</StatusNotice> : (
              <div className="mt-3 overflow-x-auto rounded-[10px] border border-[var(--line)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--page-soft)] text-[var(--muted)]">
                    <tr>{['network_record_name', 'network_record_type', 'network_record_ttl', 'network_record_data'].map((key) => <th key={key} scope="col" className="px-3 py-2 font-medium">{t(key)}</th>)}</tr>
                  </thead>
                  <tbody>{dns.answers.map((record, index) => (
                    <tr key={index} className="border-t border-[var(--line)] font-mono text-[var(--text-strong)]">
                      <td className="px-3 py-3 break-all">{record.name}</td>
                      <td className="px-3 py-3">{dnsTypeLabel(record.type)}</td>
                      <td className="px-3 py-3">{record.ttl}</td>
                      <td className="min-w-48 px-3 py-3 break-all">{record.data}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ToolPanel>

      <ToolPanel className="mt-5" title={t('network_http_title')} description={t('network_http_desc')}>
        <p className="tool-label">{t('network_allowed_hosts')}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {allowedHosts.map((hostname) => <Button key={hostname} size="sm" variant="secondary" onClick={() => setTarget(`https://${hostname}/`)}>{hostname}</Button>)}
        </div>
        <p className="mb-5 text-sm leading-6 text-[var(--muted)]">{t('network_allowed_note')}</p>
        <form onSubmit={inspect} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="tool-label" htmlFor="network-url">{t('network_url')}</label>
            <input id="network-url" type="url" className="tool-control font-mono" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="https://example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={2048} />
          </div>
          <Button type="submit" loading={httpTask.loading}>{t('network_inspect')}</Button>
        </form>
        <NetworkErrorNotice code={httpTask.error} />
        {httpTask.result && (
          <div className="mt-5 space-y-4">
            {httpTask.result.hops.map((hop, index) => (
              <article key={`${index}:${hop.url}`} className="rounded-[10px] border border-[var(--line)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-all font-mono text-sm font-medium text-[var(--text-strong)]">{t('network_hop')} {index + 1} · {hop.url}</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">{t('network_status')}: {hop.status} · {t('network_duration')}: {hop.durationMs} ms</p>
                  </div>
                  <CopyButton value={`${hop.url}\nHTTP ${hop.status}\n${hop.headers.map(([name, value]) => `${name}: ${value}`).join('\n')}`} />
                </div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-[8px] bg-[var(--page-soft)] p-3 font-mono text-xs leading-6 text-[var(--text-strong)]">{hop.headers.length ? hop.headers.map(([name, value]) => `${name}: ${value}`).join('\n') : t('network_no_headers')}</pre>
              </article>
            ))}
            {httpTask.result.stopped && <StatusNotice tone="warning">{t('network_redirect_stopped')} {t(`network_error_${httpTask.result.stopped}`)}</StatusNotice>}
          </div>
        )}
      </ToolPanel>
    </ToolLayout>
  );
}
