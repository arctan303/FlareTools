import { useI18n } from '../../contexts/I18nContext';
import StatusNotice from './StatusNotice';

export default function LocalToolNotice({ className = '' }) {
  const { t } = useI18n();
  return (
    <StatusNotice className={className} title={t('local_tool_notice_title')}>
      {t('local_tool_notice_body')}
    </StatusNotice>
  );
}
