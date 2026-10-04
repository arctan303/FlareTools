import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { dateToTimestamp, timestampToDate } from '../../utils/timestampTools';

const INITIAL_TIMESTAMP = Math.floor(Date.now() / 1000);

export default function Timestamp() {
  const { lang, t } = useI18n();
  const [currentTs, setCurrentTs] = useState(INITIAL_TIMESTAMP);
  const [inputDate, setInputDate] = useState('');
  const [inputTs, setInputTs] = useState('');
  const [inputUnit, setInputUnit] = useState('auto');
  const [outputUnit, setOutputUnit] = useState('seconds');
  const [displayZone, setDisplayZone] = useState('local');
  const dateResult = useMemo(() => dateToTimestamp(inputDate, outputUnit), [inputDate, outputUnit]);
  const timestampResult = useMemo(() => timestampToDate(inputTs, inputUnit), [inputTs, inputUnit]);
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en';
  const outputDate = timestampResult.value
    ? displayZone === 'utc' ? timestampResult.value.toISOString() : timestampResult.value.toLocaleString(locale, { timeZoneName: 'short' })
    : '';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ToolLayout>
      <SEO titleKey="tool_timestamp_converter" descriptionKey="tool_timestamp_converter_desc" />
      <ToolPageHeader eyebrow={t('local_tool_eyebrow')} icon={Clock} title={t('tool_timestamp_converter')} description={t('tool_timestamp_converter_desc')} />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5 text-center" title={t('tool_ts_current')}>
        <output className="block break-all font-mono text-4xl font-semibold text-[var(--accent)] sm:text-5xl">{currentTs}</output>
        <CopyButton className="mt-4" value={String(currentTs)} />
      </ToolPanel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ToolPanel title={t('tool_ts_to_date')}>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="tool-label" htmlFor="timestamp-unit">{t('local_ts_input_unit')}</label>
              <select id="timestamp-unit" value={inputUnit} onChange={(event) => setInputUnit(event.target.value)} className="tool-control">
                <option value="auto">{t('local_ts_auto')}</option>
                <option value="seconds">{t('local_ts_seconds')}</option>
                <option value="milliseconds">{t('local_ts_milliseconds')}</option>
              </select>
            </div>
            <div>
              <label className="tool-label" htmlFor="timestamp-zone">{t('local_ts_display_zone')}</label>
              <select id="timestamp-zone" value={displayZone} onChange={(event) => setDisplayZone(event.target.value)} className="tool-control">
                <option value="local">{t('local_ts_local')}</option>
                <option value="utc">UTC (ISO 8601)</option>
              </select>
            </div>
          </div>
          {inputUnit === 'auto' && <p className="mb-4 text-xs text-[var(--muted)]">{t('local_ts_auto_hint')}</p>}
          <label className="tool-label" htmlFor="timestamp-input">{t('tool_ts_unix_label')}</label>
          <input
            id="timestamp-input"
            type="text"
            inputMode="numeric"
            value={inputTs}
            onChange={(event) => setInputTs(event.target.value)}
            className="tool-control font-mono"
            placeholder={t('tool_ts_date_placeholder')}
          />
          {timestampResult.error && <StatusNotice className="mt-3" tone="error">{t('tool_ts_invalid_ts')}</StatusNotice>}
          <label className="tool-label mt-5" htmlFor="date-output">{t('tool_ts_date_string')}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="date-output" readOnly value={outputDate} className="tool-control font-mono" placeholder={t('tool_ts_result')} />
            <CopyButton className="sm:shrink-0" value={outputDate} />
          </div>
        </ToolPanel>

        <ToolPanel title={t('tool_ts_date_to_ts')}>
          <label className="tool-label" htmlFor="date-output-unit">{t('local_ts_output_unit')}</label>
          <select id="date-output-unit" value={outputUnit} onChange={(event) => setOutputUnit(event.target.value)} className="tool-control mb-4">
            <option value="seconds">{t('local_ts_seconds')}</option>
            <option value="milliseconds">{t('local_ts_milliseconds')}</option>
          </select>
          <label className="tool-label" htmlFor="date-input">{t('tool_ts_iso')}</label>
          <input
            id="date-input"
            type="text"
            value={inputDate}
            onChange={(event) => setInputDate(event.target.value)}
            className="tool-control font-mono"
            placeholder={t('tool_ts_iso_placeholder')}
          />
          <p className="mt-2 text-xs text-[var(--muted)]">{t('local_ts_date_zone_hint')}</p>
          {dateResult.error && <StatusNotice className="mt-3" tone="error">{t('tool_ts_invalid_date')}</StatusNotice>}
          <label className="tool-label mt-5" htmlFor="timestamp-output">{t('tool_ts_unix_label')}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="timestamp-output" readOnly value={dateResult.value} className="tool-control font-mono" placeholder={t('tool_ts_result')} />
            <CopyButton className="sm:shrink-0" value={dateResult.value} />
          </div>
        </ToolPanel>
      </div>
    </ToolLayout>
  );
}
