import { useState } from 'react';
import { Palette } from 'lucide-react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import CopyButton from '../../components/ui/CopyButton';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { fromHex, fromHsl, fromRgb } from '../../utils/colorTools';

export default function Color() {
  const { t } = useI18n();
  const [errorKey, setErrorKey] = useState(null);
  const [hex, setHex] = useState('#3b82f6');
  const [hsl, setHsl] = useState('217, 91%, 60%');
  const [rgb, setRgb] = useState('59, 130, 246');

  const applyResult = (result) => {
    if (result.error) {
      setErrorKey(`tool_color_${result.error.replaceAll('-', '_')}`);
      return false;
    }
    setHex(result.hex);
    setHsl(result.hsl);
    setRgb(result.rgb);
    setErrorKey(null);
    return true;
  };

  const changeHex = (value) => {
    setHex(value);
    applyResult(fromHex(value));
  };
  const changeRgb = (value) => {
    setRgb(value);
    const result = fromRgb(value);
    if (!result.error) setRgb(result.rgb);
    applyResult(result);
  };
  const changeHsl = (value) => {
    setHsl(value);
    const result = fromHsl(value);
    if (!result.error) setHsl(result.hsl);
    applyResult(result);
  };

  const fields = [
    ['hex', 'HEX', hex, changeHex, hex],
    ['rgb', 'RGB', rgb, changeRgb, `rgb(${rgb})`],
    ['hsl', 'HSL', hsl, changeHsl, `hsl(${hsl})`],
  ];

  return (
    <ToolLayout>
      <SEO titleKey="tool_color_converter" descriptionKey="tool_color_converter_desc" />
      <ToolPageHeader eyebrow={t('local_tool_eyebrow')} icon={Palette} title={t('tool_color_converter')} description={t('tool_color_converter_desc')} />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            {fields.map(([id, label, value, onChange, copyValue]) => (
              <div key={id}>
                <label className="tool-label" htmlFor={`color-${id}`}>{label}</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id={`color-${id}`}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    spellCheck="false"
                    className="tool-control font-mono"
                  />
                  <CopyButton className="sm:shrink-0" value={copyValue} />
                </div>
              </div>
            ))}
            {errorKey && <StatusNotice tone="error">{t(errorKey)}</StatusNotice>}
          </div>

          <section className="flex min-h-80 flex-col items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-6" aria-label={t('tool_color_preview')}>
            <div
              className="size-48 rounded-[10px] border border-[var(--line-strong)] shadow-inner transition-colors duration-[var(--motion-base)]"
              style={{ backgroundColor: fromHex(hex).error ? '#3b82f6' : hex }}
            />
            <p className="mt-5 font-mono text-lg font-semibold text-[var(--text-strong)]">{hex.toUpperCase()}</p>
            <p className="mt-1 font-mono text-sm text-[var(--muted)]">rgb({rgb})</p>
          </section>
        </div>
      </ToolPanel>
    </ToolLayout>
  );
}
