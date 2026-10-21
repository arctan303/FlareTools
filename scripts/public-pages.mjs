import { HOME_TOOLS } from '../src/config/toolCatalog.js';
import translations from '../src/locales/translations.js';

export const PUBLIC_PAGES = Object.freeze([
  { path: '/', titleKey: 'site_name', descriptionKey: 'site_description' },
  { path: '/about', titleKey: 'about_title', descriptionKey: 'about_desc' },
  ...HOME_TOOLS,
]);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function pageMetadata(page, siteUrl) {
  const origin = new URL(siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('VITE_SITE_URL must use HTTP or HTTPS');
  const t = translations['zh-CN'];
  const heading = t[page.titleKey];
  const description = t[page.descriptionKey];
  if (!heading || !description) throw new Error(`Missing public page translation: ${page.path}`);
  return {
    heading,
    description,
    title: page.path === '/' ? `${t.site_name_short} | ${t.site_seo_tagline}` : `${heading} | ${t.site_name_short}`,
    canonical: new URL(page.path, origin.origin).href,
    origin: origin.origin,
  };
}

export function renderPublicPage(template, page, siteUrl) {
  const meta = pageMetadata(page, siteUrl);
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(meta.canonical);
  const head = [
    `<title data-static-seo="true">${title}</title>`,
    `<meta data-static-seo="true" name="description" content="${description}">`,
    `<link data-static-seo="true" rel="canonical" href="${canonical}">`,
    `<meta data-static-seo="true" property="og:title" content="${title}">`,
    `<meta data-static-seo="true" property="og:description" content="${description}">`,
    `<meta data-static-seo="true" property="og:url" content="${canonical}">`,
    `<meta data-static-seo="true" property="og:site_name" content="FlareTools">`,
    `<meta data-static-seo="true" property="og:locale" content="zh_CN">`,
    `<meta data-static-seo="true" name="twitter:title" content="${title}">`,
    `<meta data-static-seo="true" name="twitter:description" content="${description}">`,
  ].join('\n    ');
  const links = HOME_TOOLS.map((tool) => `<li><a href="${escapeHtml(tool.path)}">${escapeHtml(translations['zh-CN'][tool.titleKey])}</a></li>`).join('\n');
  const fallback = `<noscript id="public-page-content"><main style="max-width:1240px;margin:0 auto;padding:2rem 1rem">
<h1>${escapeHtml(meta.heading)}</h1><p>${description}</p>
<nav aria-label="工具导航"><a href="/">FlareTools</a> · <a href="/about">关于</a><ul>${links}</ul></nav>
</main></noscript>`;
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'FlareTools',
    url: `${meta.origin}/`, alternateName: ['FlareTools', 'Flare Tools'],
    description: translations['zh-CN'].site_description,
  }).replace(/</g, '\u003c');
  if (!/<noscript id="public-page-content">[\s\S]*?<\/noscript>/.test(template)) throw new Error('Public page fallback is missing');
  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name="(?:description|twitter:title|twitter:description)"|property="(?:og:title|og:description|og:url|og:site_name|og:locale)")[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, '')
    .replace('</head>', () => `    ${head}\n  </head>`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${schema}</script>`)
    .replace(/<noscript id="public-page-content">[\s\S]*?<\/noscript>/, () => fallback);
}

// Emit before the PWA closeBundle hook so precache revisions match the final HTML.
// Individual .html files preserve extensionless URLs under Workers' default asset routing.
export function publicPagesPlugin() {
  let siteUrl;
  return {
    name: 'flaretools-public-pages',
    enforce: 'post',
    apply: 'build',
    configResolved(config) {
      siteUrl = config.env.VITE_SITE_URL || 'https://tools.arcinks.com';
    },
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset' || typeof index.source !== 'string') throw new Error('Built index.html is missing');
      const template = index.source;
      for (const page of PUBLIC_PAGES) {
        const source = renderPublicPage(template, page, siteUrl);
        if (page.path === '/') index.source = source;
        else this.emitFile({ type: 'asset', fileName: `${page.path.slice(1)}.html`, source });
      }
    },
  };
}