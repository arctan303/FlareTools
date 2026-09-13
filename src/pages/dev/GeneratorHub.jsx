import { useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { NIL as uuidNil, v1 as uuidv1, v4 as uuidv4 } from 'uuid';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import Button from '../../components/ui/Button';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { generatePassword } from '../../utils/generatorTools';

export default function GeneratorHub() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('password');
  const [incLowercase, setIncLowercase] = useState(true);
  const [incNumbers, setIncNumbers] = useState(true);
  const [incSymbols, setIncSymbols] = useState(true);
  const [incUppercase, setIncUppercase] = useState(true);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [pwdLength, setPwdLength] = useState(16);
  const [uuidCount, setUuidCount] = useState(1);
  const [uuids, setUuids] = useState('');
  const [uuidVersion, setUuidVersion] = useState('v4');

  const createPassword = () => {
    const result = generatePassword({
      length: pwdLength,
      lowercase: incLowercase,
      numbers: incNumbers,
      symbols: incSymbols,
      uppercase: incUppercase,
    });
    setPassword(result.value);
    setPasswordError(Boolean(result.error));
  };

  const createUuids = () => {
    const generators = { nil: () => uuidNil, v1: uuidv1, v4: uuidv4 };
    const count = Math.min(100, Math.max(1, Number(uuidCount) || 1));
    setUuidCount(count);
    setUuids(Array.from({ length: count }, () => generators[uuidVersion]()).join('\n'));
  };

  const checkboxOptions = [
    ['uppercase', incUppercase, setIncUppercase, 'tool_password_uppercase'],
    ['lowercase', incLowercase, setIncLowercase, 'tool_password_lowercase'],
    ['numbers', incNumbers, setIncNumbers, 'tool_password_numbers'],
    ['symbols', incSymbols, setIncSymbols, 'tool_password_symbols'],
  ];

  return (
    <ToolLayout>
      <SEO titleKey="tool_generator_hub" descriptionKey="tool_generator_hub_desc" />
      <ToolPageHeader
        eyebrow={t('local_tool_eyebrow')}
        icon={KeyRound}
        title={t('tool_generator_hub')}
        description={t('tool_generator_hub_desc')}
      />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5 !p-0 overflow-hidden">
        <div className="flex border-b border-[var(--line)] bg-[var(--page-soft)] p-1.5" role="tablist" aria-label={t('tool_generator_mode')}>
          {[
            ['password', 'tool_password_generator'],
            ['uuid', 'tool_uuid_generator'],
          ].map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => setActiveTab(value)}
              className={`min-h-11 flex-1 rounded-[8px] px-4 text-sm font-medium ${activeTab === value ? 'bg-[var(--surface)] text-[var(--accent)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'}`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {activeTab === 'password' ? (
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
            <section>
              <h2 className="font-brand text-xl font-semibold text-[var(--text-strong)]">{t('tool_password_result')}</h2>
              <output className="mt-3 flex min-h-28 items-center break-all rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4 font-mono text-base text-[var(--text-strong)]">
                {password || <span className="font-sans text-sm text-[var(--faint)]">{t('tool_generate_placeholder')}</span>}
              </output>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button onClick={createPassword}>
                  <RefreshCw className="size-4" aria-hidden="true" /> {t('tool_password_generate')}
                </Button>
                <CopyButton value={password} />
              </div>
              {passwordError && (
                <StatusNotice className="mt-4" tone="error">{t('tool_password_select_type')}</StatusNotice>
              )}
            </section>

            <section className="rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4">
              <label className="tool-label" htmlFor="password-length">
                {t('tool_password_length')}: <span className="font-mono text-[var(--accent)]">{pwdLength}</span>
              </label>
              <input
                id="password-length"
                type="range"
                min="4"
                max="64"
                value={pwdLength}
                onChange={(event) => setPwdLength(Number(event.target.value))}
                className="min-h-11 w-full accent-[var(--accent)]"
              />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {checkboxOptions.map(([key, checked, setter, labelKey]) => (
                  <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-2 text-sm text-[var(--text)] hover:bg-[var(--surface)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => setter(event.target.checked)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
            <section>
              <label className="tool-label" htmlFor="uuid-output">{t('tool_uuid_result')}</label>
              <textarea
                id="uuid-output"
                readOnly
                value={uuids}
                placeholder={t('tool_generate_placeholder')}
                className="tool-control min-h-52 font-mono text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <Button onClick={createUuids}>
                  <RefreshCw className="size-4" aria-hidden="true" /> {t('tool_uuid_generate')}
                </Button>
                <CopyButton value={uuids} label={t('tool_uuid_copy_all')} />
              </div>
            </section>

            <section className="space-y-4 rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-4">
              <div>
                <label className="tool-label" htmlFor="uuid-version">{t('tool_uuid_version')}</label>
                <select id="uuid-version" value={uuidVersion} onChange={(event) => setUuidVersion(event.target.value)} className="tool-control">
                  <option value="v4">{t('tool_uuid_v4')}</option>
                  <option value="v1">{t('tool_uuid_v1')}</option>
                  <option value="nil">{t('tool_uuid_nil')}</option>
                </select>
              </div>
              <div>
                <label className="tool-label" htmlFor="uuid-count">{t('tool_uuid_count')}</label>
                <input
                  id="uuid-count"
                  type="number"
                  min="1"
                  max="100"
                  value={uuidCount}
                  onChange={(event) => setUuidCount(event.target.value)}
                  className="tool-control"
                />
              </div>
            </section>
          </div>
        )}
      </ToolPanel>
    </ToolLayout>
  );
}
