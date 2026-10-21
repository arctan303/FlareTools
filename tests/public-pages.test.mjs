import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_PAGES, pageMetadata, renderPublicPage, publicPagesPlugin } from '../scripts/public-pages.mjs';
import { TOOL_PATHS } from '../src/config/toolCatalog.js';

const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('each existing public route has one initial title, description, canonical and matching readable content', () => {
  assert.deepEqual(PUBLIC_PAGES.map(({ path }) => path).sort(), ['/', '/about', ...TOOL_PATHS].sort());
  const titles = new Set();
  for (const page of PUBLIC_PAGES) {
    const html = renderPublicPage(template, page, 'https://tools.example');
    const meta = pageMetadata(page, 'https://tools.example');
    assert.equal((html.match(/<title\b/g) || []).length, 1);
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(html.includes(`<h1>${meta.heading}</h1>`));
    assert.ok(html.includes(`href="${meta.canonical}"`));
    assert.ok(html.includes(`content="${meta.description}"`));
    assert.ok(html.includes('data-static-seo="true" rel="canonical"'));
    assert.ok(html.includes('<div id="root">'));
    assert.ok(html.includes('<script type="module" src="/src/main.jsx"></script>'));
    assert.ok(html.includes('theme_pref'));
    assert.doesNotMatch(html, /name="robots"/);
    titles.add(meta.title);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.url, 'https://tools.example/');
    assert.equal((html.match(/<nav aria-label="工具导航">[\s\S]*?<\/nav>/)[0].match(/<li>/g) || []).length, 12);
  }
  assert.equal(titles.size, 14);
});

test('build plugin emits only fixed public paths and preserves final runtime scripts before PWA precaching', () => {
  const plugin = publicPagesPlugin();
  plugin.configResolved({ env: { VITE_SITE_URL: 'https://self-host.example/' } });
  const builtTemplate = template.replace('/src/main.jsx', '/assets/app-abc123.js').replace('</head>', '<script src="/registerSW.js"></script></head>');
  const bundle = { 'index.html': { type: 'asset', source: builtTemplate } };
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) }, {}, bundle);
  assert.equal(emitted.length, 13);
  assert.ok(emitted.some(({ fileName }) => fileName === 'dev/transformer.html'));
  assert.ok(emitted.every(({ fileName }) => !fileName.endsWith('/index.html') && !fileName.startsWith('api/')));
  for (const asset of [bundle['index.html'], ...emitted]) {
    assert.ok(asset.source.includes('/assets/app-abc123.js'));
    assert.ok(asset.source.includes('/registerSW.js'));
    assert.ok(asset.source.includes('https://self-host.example/'));
  }
});

test('generation fails clearly on broken build inputs instead of silently publishing generic pages', () => {
  assert.throws(() => renderPublicPage('<html></html>', PUBLIC_PAGES[0], 'https://tools.example'), /fallback is missing/);
  assert.throws(() => pageMetadata({ path: '/', titleKey: 'missing', descriptionKey: 'missing' }, 'https://tools.example'), /Missing public page translation/);
  assert.throws(() => pageMetadata(PUBLIC_PAGES[0], 'javascript:alert(1)'), /must use HTTP or HTTPS/);
  const plugin = publicPagesPlugin();
  plugin.configResolved({ env: {} });
  assert.throws(() => plugin.generateBundle({}, {}), /Built index.html is missing/);
});