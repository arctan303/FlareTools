import { useMemo, useState } from 'react';
import { Key } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { decodeJwt } from '../../utils/jwtTools';

export default function Jwt() {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const decoded = useMemo(() => decodeJwt(token), [token]);

  return (
    <ToolLayout>
      <SEO titleKey="tool_jwt_decoder" descriptionKey="tool_jwt_decoder_desc" />
      <ToolPageHeader eyebrow={t('local_tool_eyebrow')} icon={Key} title={t('tool_jwt_decoder')} description={t('tool_jwt_decoder_desc')} />
      <LocalToolNotice className="mt-6" />
      <StatusNotice className="mt-4" tone="warning" title={t('tool_jwt_warning_title')}>
        {t('tool_jwt_warning_body')}
      </StatusNotice>

      <ToolPanel className="mt-5" title={t('tool_jwt_encoded_token')}>
        <label className="sr-only" htmlFor="jwt-token">{t('tool_jwt_encoded_token')}</label>
        <textarea
          id="jwt-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="tool-control min-h-36 break-all font-mono text-sm"
          placeholder={t('tool_jwt_placeholder')}
          spellCheck="false"
        />
        {decoded.error && <StatusNotice className="mt-4" tone="error">{t('tool_jwt_invalid')}</StatusNotice>}
      </ToolPanel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <TokenSection title={t('tool_jwt_header')} value={decoded.header} />
        <TokenSection title={t('tool_jwt_payload')} value={decoded.payload} tall />
      </div>
    </ToolLayout>
  );
}

function TokenSection({ tall = false, title, value }) {
  return (
    <ToolPanel>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-brand text-xl font-semibold text-[var(--text-strong)]">{title}</h2>
        <CopyButton value={value} />
      </div>
      <textarea
        readOnly
        aria-label={title}
        value={value}
        placeholder="{ }"
        className={`tool-control font-mono text-sm ${tall ? 'min-h-72' : 'min-h-56'}`}
      />
    </ToolPanel>
  );
}
