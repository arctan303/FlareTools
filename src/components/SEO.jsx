import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';

export default function SEO({ title, description, titleKey, descriptionKey, robots }) {
  const { lang, t } = useI18n();
  const { pathname } = useLocation();

  const siteName = t('site_name');
  const siteNameShort = t('site_name_short');
  const siteSeoTagline = t('site_seo_tagline');
  const finalTitle = titleKey ? t(titleKey) : title;
  const finalDescription = descriptionKey ? t(descriptionKey) : description;
  const isHome = !finalTitle || finalTitle === siteName;
  const fullTitle = isHome
    ? `${siteNameShort} | ${siteSeoTagline}`
    : `${finalTitle} | ${siteNameShort}`;
  const baseUrl = import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const canonicalUrl = `${baseUrl}${pathname}`;
  const ogLocale = lang === 'zh-CN' ? 'zh_CN' : 'en_US';

  return (
    <Helmet htmlAttributes={{ lang }}>
      <title>{fullTitle}</title>
      {finalDescription && <meta name="description" content={finalDescription} />}
      {robots && <meta name="robots" content={robots} />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      <meta property="og:title" content={fullTitle} />
      {finalDescription && <meta property="og:description" content={finalDescription} />}
      <meta property="og:site_name" content={siteNameShort} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:locale" content={ogLocale} />
      <meta name="twitter:title" content={fullTitle} />
      {finalDescription && <meta name="twitter:description" content={finalDescription} />}
    </Helmet>
  );
}
