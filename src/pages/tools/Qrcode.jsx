import { useMemo, useState } from 'react';
import { Download, QrCode as QrCodeIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import SEO from '../../components/SEO';
import ToolLayout from '../../components/layout/ToolLayout';
import Button from '../../components/ui/Button';
import LocalToolNotice from '../../components/ui/LocalToolNotice';
import StatusNotice from '../../components/ui/StatusNotice';
import ToolPageHeader from '../../components/ui/ToolPageHeader';
import ToolPanel from '../../components/ui/ToolPanel';
import { useI18n } from '../../contexts/I18nContext';
import { validateQrContent } from '../../utils/qrTools';

export default function Qrcode() {
  const { t } = useI18n();
  const [bgColor, setBgColor] = useState('#ffffff');
  const [downloadState, setDownloadState] = useState(null);
  const [fgColor, setFgColor] = useState('#000000');
  const [size, setSize] = useState(256);
  const [text, setText] = useState('https://github.com/arctan303/FlareTools');
  const contentState = useMemo(() => validateQrContent(text), [text]);
  const canRender = contentState.status === 'valid';

  const downloadQR = (format) => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) {
      setDownloadState('error');
      return;
    }
    const exportSvg = svg.cloneNode(true);
    exportSvg.setAttribute('width', String(size));
    exportSvg.setAttribute('height', String(size));
    exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(exportSvg))}`;
    if (format === 'svg') {
      const link = document.createElement('a');
      link.download = `qrcode_${Date.now()}.svg`;
      link.href = svgUrl;
      link.click();
      setDownloadState('success');
      return;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      setDownloadState('error');
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        canvas.width = size;
        canvas.height = size;
        context.imageSmoothingEnabled = false;
        context.fillStyle = bgColor;
        context.fillRect(0, 0, size, size);
        context.drawImage(image, 0, 0, size, size);
        const link = document.createElement('a');
        link.download = `qrcode_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        setDownloadState('success');
      } catch {
        setDownloadState('error');
      }
    };
    image.onerror = () => setDownloadState('error');
    image.src = svgUrl;
  };

  return (
    <ToolLayout>
      <SEO titleKey="tool_qr_generator" descriptionKey="tool_qr_generator_desc" />
      <ToolPageHeader eyebrow={t('local_tool_eyebrow')} icon={QrCodeIcon} title={t('tool_qr_generator')} description={t('tool_qr_generator_desc')} />
      <LocalToolNotice className="mt-6" />

      <ToolPanel className="mt-5">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-6">
            <div>
              <label className="tool-label" htmlFor="qr-content">{t('tool_qr_content_label')}</label>
              <textarea
                id="qr-content"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setDownloadState(null);
                }}
                className="tool-control min-h-36"
                placeholder={t('tool_qr_content_placeholder')}
              />
              <p className="mt-2 text-xs text-[var(--faint)]">
                {t('tool_qr_byte_count')}: {contentState.bytes} / 2300
              </p>
              {contentState.status === 'too-long' && (
                <StatusNotice className="mt-3" tone="error">{t('tool_qr_too_long')}</StatusNotice>
              )}
            </div>
            <div>
              <label className="tool-label" htmlFor="qr-size">
                {t('tool_qr_size_label')}: <span className="font-mono text-[var(--accent)]">{size}</span>
              </label>
              <input
                id="qr-size"
                type="range"
                min="128"
                max="512"
                step="32"
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
                className="min-h-11 w-full accent-[var(--accent)]"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['foreground', t('tool_qr_foreground'), fgColor, setFgColor],
                ['background', t('tool_qr_background'), bgColor, setBgColor],
              ].map(([id, label, value, setter]) => (
                <div key={id}>
                  <label className="tool-label" htmlFor={`qr-${id}`}>{label}</label>
                  <div className="flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--line-strong)] bg-[var(--page-soft)] px-3">
                    <input id={`qr-${id}`} type="color" value={value} onChange={(event) => setter(event.target.value)} className="size-8 cursor-pointer border-0 bg-transparent" />
                    <span className="font-mono text-sm text-[var(--muted)]">{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-[420px] flex-col items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--page-soft)] p-5" aria-label={t('tool_qr_preview')}>
            <div className="max-w-full overflow-auto rounded-[10px] border border-[var(--line)] bg-white p-4">
              {canRender ? (
                <QRCodeSVG id="qr-code-svg" value={text} size={Math.min(size, 288)} fgColor={fgColor} bgColor={bgColor} level="M" marginSize={4} />
              ) : (
                <div className="flex size-52 items-center justify-center px-4 text-center text-sm text-[var(--faint)]">
                  {t(contentState.status === 'too-long' ? 'tool_qr_too_long' : 'tool_qr_no_content')}
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button disabled={!canRender} onClick={() => downloadQR('png')}>
                <Download className="size-4" aria-hidden="true" /> {t('tool_qr_download')}
              </Button>
              <Button variant="secondary" disabled={!canRender} onClick={() => downloadQR('svg')}>
                <Download className="size-4" aria-hidden="true" /> {t('local_qr_download_svg')}
              </Button>
            </div>
            {downloadState && (
              <StatusNotice className="mt-4 w-full" tone={downloadState === 'success' ? 'success' : 'error'}>
                {t(downloadState === 'success' ? 'local_qr_downloaded' : 'local_qr_download_failed')}
              </StatusNotice>
            )}
          </section>
        </div>
      </ToolPanel>
    </ToolLayout>
  );
}
