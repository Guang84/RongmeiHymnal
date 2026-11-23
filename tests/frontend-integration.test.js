import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const loaderBase = 'https://raw.githubusercontent.com/Guang84/Glab-assets/main/shared/GLab-loader';

test('all app interfaces use the same pinned GLab Loader release', async () => {
  for (const page of ['../index.html', '../book.html', '../hymn.html']) {
    const html = await read(page);
    assert.ok(html.includes(loaderBase + '/GLab-loader.css'), page + ' must load shared loader CSS');
    assert.ok(html.includes(loaderBase + '/GLab-loader.js'), page + ' must load shared loader JS');
    assert.ok(!html.includes('data-app-loader'), page + ' must not keep the retired app-specific loader');
  }
});

test('application startup controls the shared loader lifecycle safely', async () => {
  const app = await read('../js/app.js');
  assert.match(app, /new window\.GLabLoader/);
  assert.match(app, /loader\?\.show\(\)/);
  assert.match(app, /loader\?\.hide\(\)/);
  assert.match(app, /timeoutMs:\s*15000/);
  assert.match(app, /typeof window\.GLabLoader === 'function'/);
});

test('frontend stylesheet includes mobile, dark-theme and reduced-motion safeguards', async () => {
  const css = await read('../css/main.css');
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /body\.dark \.library-hero-v2/);
  assert.match(css, /body\.dark \.library-about/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
});

test('reader keeps adjustable text and a constrained long-form reading measure', async () => {
  const css = await read('../css/main.css');
  const html = await read('../hymn.html');
  assert.match(css, /--copy-measure:\s*68ch/);
  assert.match(css, /\.lyrics\s*\{[^}]*max-width:\s*var\(--copy-measure\)/s);
  assert.ok(html.includes('data-font-step'));
  assert.ok(html.includes('data-language-select'));
  assert.ok(html.includes('data-song-outline'));
});

test('all pages keep a mobile viewport and keyboard skip navigation', async () => {
  for (const page of ['../index.html', '../book.html', '../hymn.html']) {
    const html = await read(page);
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /aria-label="Primary"/);
  }
});
