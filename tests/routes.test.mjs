import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HOME_TOOLS, TOOL_PATHS } from '../src/config/toolCatalog.js';

const appUrl = new URL('../src/App.jsx', import.meta.url);
const sitemapUrl = new URL('../public/sitemap.xml', import.meta.url);

test('catalog tools, app routes and sitemap stay aligned', async () => {
  const [appSource, sitemap] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(sitemapUrl, 'utf8'),
  ]);

  const appRoutes = new Set(
    [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path !== '*'),
  );
  const sitemapPaths = new Set(
    [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)]
      .map((match) => match[1]),
  );

  assert.deepEqual([...appRoutes].sort(), ['/', '/about', ...TOOL_PATHS].sort());
  assert.deepEqual([...sitemapPaths].sort(), [...appRoutes].sort());
});

test('the catalog contains one cross-device, two cloud and nine local tools', () => {
  assert.deepEqual(TOOL_PATHS.slice(0, 1), ['/share/text']);
  assert.equal(TOOL_PATHS.length, 12);
  assert.equal(HOME_TOOLS.filter((tool) => tool.scopeKey === 'home_scope_local').length, 9);
  assert.equal(HOME_TOOLS.filter((tool) => tool.scopeKey === 'home_scope_cloud').length, 2);
  assert.equal(new Set(TOOL_PATHS).size, TOOL_PATHS.length);
});

test('the home directory uses one complete card model for every tool', () => {
  assert.deepEqual(HOME_TOOLS.map((tool) => tool.path), TOOL_PATHS);
  assert.equal(HOME_TOOLS.length, 12);
  HOME_TOOLS.forEach((tool) => {
    assert.ok(tool.categoryTitleKey);
    assert.ok(tool.descriptionKey);
    assert.ok(tool.icon);
    assert.ok(tool.scopeKey);
  });
});

test('the header is local-only and uses the confirmed wordmark', async () => {
  const headerSource = await readFile(new URL('../src/components/layout/Header.jsx', import.meta.url), 'utf8');
  const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(headerSource, /Wrench|https:\/\/arctan\.top|https:\/\/blog\.arctan\.top/);
  assert.match(headerSource, /brand_wordmark/);
  assert.match(headerSource, /nav_home/);
  assert.match(headerSource, /nav_about/);
  assert.match(indexSource, /FlareTools/);
});

test('the PWA manifest and README use the confirmed brand', async () => {
  const [viteConfig, readme] = await Promise.all([
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ]);

  assert.match(viteConfig, /name:\s*'FlareTools'/);
  assert.match(viteConfig, /short_name:\s*'FlareTools'/);
  assert.match(readme, /^# FlareTools/m);
});
